const bcrypt = require("bcrypt");
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const cloudinary = require("./cloudinary");
require("dotenv").config();
const { Pool } = require("pg");

const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const allowedOrigins = [
  "http://localhost:3000",
  "https://influencerplatformfend.up.railway.app"
];

app.use(express.json());

app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      "http://localhost:3000",
      "https://influencerplatformfend.up.railway.app"
    ];

    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(null, true); // TEMP FIX (important for debugging)
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
}));

// Simple in-memory SSE clients map
const sseClients = new Map(); // clientId -> send function
let nextClientId = 1;

function addSseClient(sendFn) {
  const id = nextClientId++;
  sseClients.set(id, sendFn);
  return id;
}

function removeSseClient(id) {
  sseClients.delete(id);
}

async function broadcastInfluencers() {
  try {
    const profiles = await pool.query(`SELECT * FROM influencer_profiles ORDER BY id DESC`);
    const payload = JSON.stringify({ type: 'update', influencers: profiles.rows });
    for (const send of sseClients.values()) {
      try {
        send(payload);
      } catch (e) {
        // ignore individual client errors
      }
    }
  } catch (e) {
    console.log('Error broadcasting influencers', e);
  }
}

pool.query("SELECT 1")
  .then(() => {
    console.log("PostgreSQL connected successfully");
  })
  .catch((err) => {
    console.log("Database connection error", err);
  });



/* =========================
   HOME API
========================= */

app.get("/", (req, res) => {

  res.send(
    "Backend server is running successfully"
  );

});



/* =========================
   TEST API
========================= */

app.get("/api/test", (req, res) => {

  res.json({
    message: "API working successfully",
  });

});



/* =========================
   SIGNUP API
========================= */

app.post("/api/signup", async (req, res) => {

  try {

    const {
      name,
      email,
      password,
      role,
    } = req.body;

    const hashedPassword =
      await bcrypt.hash(password, 10);

    const newUser = await pool.query(
      `
      INSERT INTO users
      (
        name,
        email,
        password,
        role
      )
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, role
      `,
      [
        name,
        email,
        hashedPassword,
        role,
      ]
    );

    res.json({
      success: true,
      message: "Signup successful",
      user: newUser.rows[0],
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      message: "Something went wrong",
    });

  }

});


/* =========================
   LOGIN API
========================= */

app.post("/api/login", async (req, res) => {

  try {

    const { email, password } = req.body;

    const result = await pool.query(
      `
      SELECT *
      FROM users
      WHERE email = $1
      `,
      [email]
    );

    if (result.rows.length === 0) {

      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });

    }

    const user = result.rows[0];

    const passwordMatch =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!passwordMatch) {

      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });

    }

    res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      message: "Something went wrong",
    });

  }

});

/* =========================
   FORGOT PASSWORD API
========================= */

app.put("/api/forgot-password", async (req, res) => {

  try {

    const { email, newPassword } = req.body;

    const userCheck = await pool.query(
      `
      SELECT *
      FROM users
      WHERE email = $1
      `,
      [email]
    );

    if (userCheck.rows.length === 0) {

      return res.status(404).json({
        success: false,
        message: "Email not found",
      });

    }

    const hashedPassword =
      await bcrypt.hash(newPassword, 10);

    await pool.query(
      `
      UPDATE users
      SET password = $1
      WHERE email = $2
      `,
      [hashedPassword, email]
    );

    res.json({
      success: true,
      message: "Password updated successfully",
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      message: "Something went wrong",
    });

  }

});


/* =========================
   CREATE PROFILE API
========================= */

app.post(
  "/api/create-profile",
  async (req, res) => {

    try {

      const {
        user_email,
        name,
        category,
        city,
        followers_count,
        bio,
        instagram,
        image,
      } = req.body;

      await pool.query(
        `
        INSERT INTO influencer_profiles
        (
          user_email,
          name,
          category,
          city,
          followers_count,
          bio,
          instagram,
          image
        )
        VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          user_email,
          name,
          category,
          city,
          followers_count,
          bio,
          instagram,
          image,
        ]
      );

      res.json({
        success: true,
        message:
          "Profile created successfully",
      });

      // broadcast updated list to SSE clients
      broadcastInfluencers();

      // notify Postgres listeners
      try {
        await pool.query("NOTIFY influencers_channel, 'profile_created'");
      } catch (e) {
        console.log('Error sending NOTIFY after create:', e);
      }

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
        message: "Something went wrong",
      });

    }

  }
);

app.post("/api/upload-image", async (req, res) => {
  try {
    const { image } = req.body;

    const result = await cloudinary.uploader.upload(image, {
      folder: "profiles",
    });

    res.json({
      success: true,
      imageUrl: result.secure_url,
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false });
  }
});

/* =========================
   GET ALL INFLUENCERS
========================= */

app.get("/api/influencers", async (req, res) => {
  try {
    const profiles = await pool.query(`
SELECT
  influencer_profiles.*,
  users.id AS user_id
FROM influencer_profiles
JOIN users
  ON users.email =
     influencer_profiles.user_email
WHERE LOWER(users.status) = 'active'
  AND influencer_profiles.verification_status = 'Verified'
ORDER BY influencer_profiles.id DESC
`);

    res.json({
      success: true,
      influencers: Array.isArray(profiles.rows)
        ? profiles.rows
        : [],
    });

  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      influencers: [],
      message: "Something went wrong",
    });
  }
});

/* =========================
   INFLUENCERS SSE STREAM
========================= */

app.get('/api/influencers/stream', async (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  const send = (data) => {
    // data is stringified JSON
    res.write(`data: ${data}\n\n`);
  };

  // add client
  const clientId = addSseClient(send);

  // send initial payload
  try {
    const profiles = await pool.query(`SELECT * FROM influencer_profiles ORDER BY id DESC`);
    send(JSON.stringify({ type: 'initial', influencers: profiles.rows }));
  } catch (e) {
    send(JSON.stringify({ type: 'error', message: 'Could not fetch influencers' }));
  }

  req.on('close', () => {
    removeSseClient(clientId);
  });
});



/* =========================
   GET SINGLE INFLUENCER
========================= */

app.get(
  "/api/influencers/:id",
  async (req, res) => {

    try {

      const { id } = req.params;

      const result =
        await pool.query(
          `
          SELECT *
          FROM influencer_profiles
          WHERE id = $1
          `,
          [id]
        );

      if (result.rows.length === 0) {

        return res.status(404).json({
          success: false,
          message:
            "Influencer not found",
        });

      }

      res.json({
        success: true,
        influencer: result.rows[0],
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
        message: "Something went wrong",
      });

    }

  }
);
app.get("/api/influencers", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM influencer_profiles
      ORDER BY created_at DESC
    `);

    return res.json({
      success: true,
      influencers: result.rows,
    });

  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      influencers: [],
    });
  }
});
app.get("/api/seo/influencer/:id", async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🔥 SEO Influencer fetch by user id:", id);

    const result = await pool.query(
      `
      SELECT 
        u.id,
        u.name,
        u.email,

        i.id AS profile_id,
        i.category,
        i.city,
        i.bio,
        i.instagram,
        i.image,
        i.followers_count

      FROM users u
      LEFT JOIN influencer_profiles i
        ON i.user_id = u.id
      WHERE u.id = $1 AND u.role = 'influencer'
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Influencer not found",
      });
    }

    return res.json({
      success: true,
      influencer: result.rows[0],
    });

  } catch (error) {
    console.log("❌ SEO API error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});
/* =========================
   INFLUENCERS BY CITY + CATEGORY
========================= */

app.get(
  "/api/influencers/city/:city/category/:category",
  async (req, res) => {

    try {

      const { city, category } = req.params;

      const result = await pool.query(
        `
        SELECT *
        FROM influencer_profiles
        WHERE LOWER(city) = LOWER($1)
        AND LOWER(category) = LOWER($2)
        `,
        [city, category]
      );

      res.json({
        success: true,
        influencers: result.rows,
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
        influencers: [],
      });

    }

  }
);
/* =========================
   GET INFLUENCERS BY CITY
========================= */

app.get(
  "/api/influencers/city/:city",
  async (req, res) => {

    try {

      const { city } = req.params;

      const result = await pool.query(
        `
        SELECT *
        FROM influencer_profiles
        WHERE LOWER(city) = LOWER($1)
        ORDER BY followers_count DESC
        `,
        [city]
      );

      res.json({
        success: true,
        influencers: result.rows,
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
        influencers: [],
      });

    }

  }
);


/* =========================
   GET PROFILE BY EMAIL
========================= */

app.get(
  "/api/profile/:email",
  async (req, res) => {

    try {

      const { email } = req.params;

      const result =
        await pool.query(
          `
          SELECT *
          FROM influencer_profiles
          WHERE user_email = $1
          `,
          [email]
        );

      if (result.rows.length === 0) {

        return res.json({
          success: false,
          message: "Profile not found",
        });

      }

      res.json({
        success: true,
        profile: result.rows[0],
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
        message: "Something went wrong",
      });

    }

  }
);



/* =========================
   UPDATE PROFILE API
========================= */

app.put(
  "/api/update-profile/:email",
  async (req, res) => {

    try {

      const { email } = req.params;

      const {
        name,
        category,
        city,
        followers_count,
        bio,
        instagram,
        image,
      } = req.body;

      await pool.query(
        `
        UPDATE influencer_profiles
        SET
          name = $1,
          category = $2,
          city = $3,
          followers_count = $4,
          bio = $5,
          instagram = $6,
          image = $7
        WHERE user_email = $8
        `,
        [
          name,
          category,
          city,
          followers_count,
          bio,
          instagram,
          image,
          email,
        ]
      );

      res.json({
        success: true,
        message:
          "Profile updated successfully",
      });

      // broadcast updated list to SSE clients
      broadcastInfluencers();

      // notify Postgres listeners
      try {
        await pool.query("NOTIFY influencers_channel, 'profile_updated'");
      } catch (e) {
        console.log('Error sending NOTIFY after update:', e);
      }

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
        message: "Something went wrong",
      });

    }

  }
);

app.post(
  "/api/invitations",
  async (req, res) => {

    try {

      console.log("Invitation Request:", req.body);

      const {
        brand_id,
        influencer_id,
        campaign_id
      } = req.body;

      await pool.query(
        `
        INSERT INTO requests
        (
          brand_id,
          influencer_id,
          campaign_id,
          status
        )
        VALUES
        ($1, $2, $3, 'Pending')
        `,
        [
          brand_id,
          influencer_id,
          campaign_id
        ]
      );

      res.json({
        success: true,
        message: "Invitation sent"
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
        message: "Failed to send invitation"
      });

    }

  }
);

app.get("/api/invitations/:influencerId", async (req, res) => {
  try {
    const { influencerId } = req.params;

    console.log("INFLUENCER (USER) ID:", influencerId);

    const result = await pool.query(
      `
      SELECT
        requests.*,
        campaigns.title,
        campaigns.budget,
        campaigns.category,
        campaigns.description
      FROM requests
      LEFT JOIN campaigns
        ON campaigns.id = requests.campaign_id
      WHERE requests.influencer_id = $1
      ORDER BY requests.created_at DESC
      `,
      [influencerId]
    );

    console.log("FOUND REQUESTS:", result.rows);

    return res.json({
      success: true,
      invitations: result.rows,
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false });
  }
});



app.put(
  "/api/quotation/:requestId",
  async (req, res) => {

    try {

      const { requestId } =
        req.params;

      const {
        quotation_amount
      } = req.body;

      await pool.query(
        `
        UPDATE requests
        SET
          quotation_amount = $1
        WHERE id = $2
        `,
        [
          quotation_amount,
          requestId
        ]
      );

      res.json({
        success: true,
        message:
          "Quotation sent successfully"
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false
      });

    }

  }
);


app.get("/api/brand-quotations/:brandId", async (req, res) => {
  try {
    const { brandId } = req.params;

  const result = await pool.query(
  `
  SELECT
  r.*,
  c.title,
  u.name AS influencer_name
FROM requests r

LEFT JOIN campaigns c
  ON c.id = r.campaign_id

LEFT JOIN users u
  ON u.id = r.influencer_id

WHERE r.brand_id = $1
AND r.quotation_amount IS NOT NULL

ORDER BY r.created_at DESC
  `,
  [brandId]
); 
    res.json({
      success: true,
      quotations: result.rows
    });

  } catch (error) {
    console.log(error);res.status(500).json({
  success: false,
  error: error.message,
  stack: error.stack
});
  }
});

app.put(
  "/api/deal/:requestId",
  async (req, res) => {

    try {

      const { requestId } =
        req.params;

      const { deal_status } =
        req.body;

      await pool.query(
        `
        UPDATE requests
        SET deal_status = $1
        WHERE id = $2
        `,
        [
          deal_status,
          requestId
        ]
      );

      res.json({
        success: true,
        message:
          "Deal status updated"
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false
      });

    }

  }
);

app.get(
  "/api/collaborations/:brandId",
  async (req, res) => {

    try {

      const { brandId } =
        req.params;

      const result =
        await pool.query(
          `
          SELECT
            r.*,
            c.title,
            i.name AS influencer_name
          FROM requests r
          LEFT JOIN campaigns c
            ON c.id::text = r.campaign_id
          LEFT JOIN influencer_profiles i
            ON i.id = r.influencer_id
          WHERE r.brand_id = $1
          AND r.deal_status = 'Accepted'
          ORDER BY r.created_at DESC
          `,
          [brandId]
        );

      res.json({
        success: true,
        collaborations:
          result.rows,
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
      });

    }

  }
);

app.get(
  "/api/my-collaborations/:influencerId",
  async (req, res) => {

    try {

      const { influencerId } =
        req.params;

      const result =
        await pool.query(
          `
          SELECT
            r.*,
            c.title,
            b.name AS brand_name
          FROM requests r
          LEFT JOIN campaigns c
  ON c.id = r.campaign_id
          LEFT JOIN users b
            ON b.id = r.brand_id
          WHERE r.influencer_id = $1
          AND r.deal_status = 'Accepted'
          ORDER BY r.created_at DESC
          `,
          [influencerId]
        );

      res.json({
        success: true,
        collaborations:
          result.rows,
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
      });

    }

  }
);


app.get(
  "/api/brand-requests/:brandId",
  async (req, res) => {
    try {
      const { brandId } = req.params;

      const result = await pool.query(
        `
        SELECT
          requests.*,
          campaigns.title,
          influencer_profiles.name AS influencer_name

        FROM requests

        LEFT JOIN campaigns
          ON campaigns.id::text =
             requests.campaign_id::text

        LEFT JOIN influencer_profiles
          ON influencer_profiles.id::text =
             requests.influencer_id::text

        WHERE requests.brand_id::text = $1

        ORDER BY requests.created_at DESC
        `,
        [brandId]
      );

      res.json({
        success: true,
        requests: result.rows,
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
      });

    }
  }
);


/* =========================
   CONTACT MESSAGE API
========================= */

app.post(
  "/api/contact",
  async (req, res) => {

    try {

      const {
        name,
        email,
        subject,
        message,
      } = req.body;

      await pool.query(
        `
        INSERT INTO contact_messages
        (
          name,
          email,
          subject,
          message
        )
        VALUES ($1, $2, $3, $4)
        `,
        [
          name,
          email,
          subject,
          message,
        ]
      );

      res.json({
        success: true,
        message:
          "Message sent successfully",
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
        message: "Something went wrong",
      });

    }

  }
);



app.get(
  "/api/contact",
  async (req, res) => {

    try {

      const result = await pool.query(
        `
        SELECT *
        FROM contact_messages
        ORDER BY id ASC
        `
      );


      res.json({
        success: true,
        messages: result.rows,
      });


    } catch(error){

      console.log(error);

      res.status(500).json({
        success:false,
        message:"Something went wrong"
      });

    }

  }
);


app.post("/api/requests", async (req, res) => {
  try {
    const { brand_id, influencer_id, campaign_id } = req.body;

    const result = await pool.query(
      `INSERT INTO requests (brand_id, influencer_id, campaign_id, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [brand_id, influencer_id, campaign_id]
    );

    res.json({
      success: true,
      request: result.rows[0],
    });

  } catch (error) {
    console.log("Request API error:", error);
   res.status(500).json({
  success: false,
  error: error.message,
  stack: error.stack
});
  }
});

app.get("/api/requests", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM requests ORDER BY created_at DESC"
    );

    res.json({
      success: true,
      requests: result.rows,
    });

  } catch (error) {
    console.log("Fetch requests error:", error);
res.status(500).json({
  success: false,
  error: error.message,
  stack: error.stack
});
  }
});

app.put(
  "/api/requests/:id",
  async (req, res) => {

    try {

      const { id } = req.params;

      const { status } = req.body;

      await pool.query(
        `
        UPDATE requests
        SET status = $1
        WHERE id = $2
        `,
        [status, id]
      );

      res.json({
        success: true,
        message: "Request updated",
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
      });

    }

  }
);
app.put(
  "/api/requests/:id/complete",
  async (req, res) => {

    try {

      const { id } = req.params;

      await pool.query(
        `
        UPDATE requests
        SET status = 'Completed'
        WHERE id = $1
        `,
        [id]
      );

      res.json({
        success: true,
        message: "Campaign marked completed",
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
      });

    }

  }
);

/* =========================
   CREATE CAMPAIGN
========================= */

app.post(
  "/api/campaigns",
  async (req, res) => {

    try {

      const {
        brand_id,
        title,
        budget,
        category,
        description
      } = req.body;

      const result =
        await pool.query(
          `
          INSERT INTO campaigns
          (
            brand_id,
            title,
            budget,
            category,
            description
          )
          VALUES
          ($1, $2, $3, $4, $5)
          RETURNING *
          `,
          [
            brand_id,
            title,
            budget,
            category,
            description
          ]
        );

      res.json({
        success: true,
        campaign:
          result.rows[0]
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false
      });

    }

  }
);

app.get(
  "/api/campaigns",
  async (req, res) => {

    try {

      const campaigns =
        await pool.query(
          `
        SELECT
  campaigns.*,
  json_agg(requests) AS requests
FROM campaigns
LEFT JOIN requests ON campaigns.id = requests.campaign_id
GROUP BY campaigns.id;
          `
        );

      res.json({
        success: true,
        campaigns:
          campaigns.rows,
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
      });

    }

  }
);
app.put("/api/campaigns/:id/complete", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE campaigns
      SET status = 'Completed'
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    res.json({
      success: true,
      campaign: result.rows[0],
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
  success: false,
  error: error.message,
  stack: error.stack
});
  }
});
// =========================
// TEST ROUTE (VERIFY DEPLOYMENT)
// =========================
app.get("/api/ping-invoice", (req, res) => {
  console.log("🔥 PING INVOICE HIT");
  res.json({ ok: true, message: "invoice backend working" });
});


// =========================
// GENERATE INVOICE (MAIN)
// =========================
app.post("/api/requests/:id/generate-invoice", async (req, res) => {
  try {
    const { id } = req.params;

    const requestResult = await pool.query(
      `SELECT * FROM requests WHERE id = $1`,
      [id]
    );

    if (!requestResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    const request = requestResult.rows[0];

    const campaignResult = await pool.query(
      `SELECT * FROM campaigns WHERE id = $1`,
      [request.campaign_id]
    );

    const brandResult = await pool.query(
      `SELECT * FROM users WHERE id = $1`,
      [request.brand_id]
    );

    const influencerResult = await pool.query(
      `SELECT * FROM influencer_profiles WHERE id = $1`,
      [request.influencer_id]
    );

    const campaign = campaignResult.rows[0];
    const brand = brandResult.rows[0];
    const influencer = influencerResult.rows[0];

    const amount = Number(request.quotation_amount || 0);
    const gst = amount * 0.18;
    const total = amount + gst;

    const invoice = await pool.query(
      `INSERT INTO invoices
      (request_id, influencer_id, brand_id, campaign_id,
       influencer_email, brand_email, campaign_name,
       amount, gst, total, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        request.id,
        request.influencer_id,
        request.brand_id,
        request.campaign_id,
        influencer.user_email,
        brand.email,
        campaign.title,
        amount,
        gst,
        total,
        "pending",
      ]
    );

    res.json({
      success: true,
      invoice: invoice.rows[0],
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false });
  }
});
app.get("/api/invoices/influencer/:email", async (req, res) => {
  const { email } = req.params;

  const result = await pool.query(
    `SELECT * FROM invoices
     WHERE influencer_email = $1
     ORDER BY created_at DESC`,
    [email]
  );

  res.json({ success: true, invoices: result.rows });
});
app.get("/api/invoices/brand/:email", async (req, res) => {
  const { email } = req.params;

  const result = await pool.query(
    `SELECT * FROM invoices
     WHERE brand_email = $1
     ORDER BY created_at DESC`,
    [email]
  );

  res.json({ success: true, invoices: result.rows });
});
app.get("/api/brand-invoices/:brandId", async (req, res) => {
  try {
    const { brandId } = req.params;

    const result = await pool.query(
      `
      SELECT i.*, c.title as campaign_title
      FROM invoices i
      LEFT JOIN campaigns c ON c.id = i.campaign_id
      WHERE i.brand_id = $1
      ORDER BY i.created_at DESC
      `,
      [brandId]
    );

    res.json({
      success: true,
      invoices: result.rows,
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
    });
  }
});
app.get("/api/invoices/brand/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT *
      FROM invoices
      WHERE brand_id = $1
      ORDER BY created_at DESC
      `,
      [id]
    );

    res.json({
      success: true,
      invoices: result.rows,
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      invoices: [],
      error: error.message,
    });
  }
});
/* =========================
   CREATE INVOICE
========================= */

// app.post(
//   "/api/invoices",
//   async (req, res) => {

//     try {

//       const {
//         influencer_email,
//         client_name,
//         campaign_name,
//         amount,
//       } = req.body;

//       const gst =
//         Number(amount) * 0.18;

//       const total =
//         Number(amount) + gst;

//       const result =
//         await pool.query(
//           `
//          INSERT INTO invoices
// (
//   influencer_email,
//   client_name,
//   campaign_name,
//   amount,
//   gst,
//   total,
//   status
// )
//           VALUES
//           ($1,$2,$3,$4,$5,$6,$7)
//           RETURNING *
//           `,
//           [
//             influencer_email,
//             client_name,
//             campaign_name,
//             amount,
//             gst,
//             total,
//             status = "Pending",
//           ]
//         );

//       res.json({
//         success: true,
//         invoice: result.rows[0],
//       });

//     } catch (error) {

//       console.log(error);

//       res.status(500).json({
//         success: false,
//         message: "Failed to create invoice",
//       });

//     }

//   }
// );
// app.get("/api/invoices/:email", async (req, res) => {
//   try {
//     const email = req.params.email?.trim().toLowerCase();

//     const result = await pool.query(
//       `
//       SELECT *
//       FROM invoices
//       WHERE LOWER(influencer_email) = $1
//       ORDER BY id DESC
//       `,
//       [email]
//     );

//     res.json({
//       success: true,
//       invoices: result.rows,
//     });
//   } catch (error) {
//     console.log(error);
//     res.status(500).json({
//       success: false,
//       invoices: [],
//     });
//   }
// });
app.put(
  "/api/invoices/:id/pay",
  async (req, res) => {

    try {

      const { id } = req.params;

      await pool.query(
        `
        UPDATE invoices
        SET status = 'Paid'
        WHERE id = $1
        RETURNING *
        `,
        [id]
      );
 if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }
      res.json({
        success: true,
        message: "Invoice marked as paid",
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
      });

    }

  }
);
// app.post("/api/invoices/generate/:requestId", async (req, res) => {
//   try {
//     const { requestId } = req.params;

//     const requestResult = await pool.query(
//       `
//       SELECT *
//       FROM requests
//       WHERE id = $1
//       `,
//       [requestId]
//     );

//     const request = requestResult.rows[0];

//     if (!request) {
//       return res.status(404).json({
//         success: false,
//         message: "Request not found",
//       });
//     }

//     if (!request.quotation_amount) {
//       return res.json({
//         success: false,
//         message: "Quotation not sent yet",
//       });
//     }

//     if (request.deal_status !== "Accepted") {
//       return res.json({
//         success: false,
//         message: "Deal not active",
//       });
//     }

//     if (request.invoice_generated) {
//       return res.json({
//         success: false,
//         message: "Invoice already generated",
//       });
//     }

//     const campaign = await pool.query(
//       `SELECT * FROM campaigns WHERE id = $1`,
//       [request.campaign_id]
//     );

//     const brand = await pool.query(
//       `SELECT * FROM users WHERE id = $1`,
//       [request.brand_id]
//     );

//     const influencer = await pool.query(
//       `SELECT * FROM influencer_profiles WHERE id = $1`,
//       [request.influencer_id]
//     );

//     const amount = Number(request.quotation_amount);
//     const gst = amount * 0.18;
//     const total = amount + gst;

//     const invoice = await pool.query(
//       `
//       INSERT INTO invoices (
//         influencer_email,
//         client_name,
//         campaign_name,
//         amount,
//         gst,
//         total,
//         status
//       )
//       VALUES ($1,$2,$3,$4,$5,$6,$7)
//       RETURNING *
//       `,
//       [
//         influencer.rows[0].user_email,
//         brand.rows[0].name,
//         campaign.rows[0].title,
//         amount,
//         gst,
//         total,
//         "Pending",
//       ]
//     );

//     await pool.query(
//       `
//       UPDATE requests
//       SET invoice_generated = true
//       WHERE id = $1
//       `,
//       [requestId]
//     );

//     return res.json({
//       success: true,
//       invoice: invoice.rows[0],
//     });

//   } catch (err) {
//     console.log(err);
//     res.status(500).json({
//       success: false,
//     });
//   }
// });
/* =========================
   GET BRAND CAMPAIGNS
========================= */

app.get(
  "/api/campaigns/:brandId",
  async (req, res) => {

    try {

      const { brandId } =
        req.params;

      const result =
        await pool.query(
          `
          SELECT *
          FROM campaigns
          WHERE brand_id = $1
          ORDER BY id DESC
          `,
          [brandId]
        );

      res.json({
        success: true,
        campaigns:
          result.rows
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false
      });

    }

  }
);

app.get("/api/search-data", async (req, res) => {

  try {

    const cities = await pool.query(`
      SELECT DISTINCT city
      FROM influencer_profiles
      WHERE city IS NOT NULL
    `);

    const categories = await pool.query(`
      SELECT DISTINCT category
      FROM influencer_profiles
      WHERE category IS NOT NULL
    `);

    res.json({
      success: true,
      cities: cities.rows,
      categories: categories.rows,
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });

  }

});
/* =========================
   ADMIN MANAGE USERS
========================= */

app.get(
  "/api/admin/users",
  async(req,res)=>{

    try{

      const result =
      await pool.query(
        `
        SELECT 
        id,
        name,
        email,
        role,
        status
        FROM users
        ORDER BY id DESC
        `
      );


      res.json({
        success:true,
        users:result.rows
      });


    }catch(error){

      console.log(error);

      res.status(500).json({
        success:false
      });

    }

});

app.put(
  "/api/admin/users/:id",
  async(req,res)=>{

    try{

      const { id } = req.params;

      const { status } = req.body;


      await pool.query(
        `
        UPDATE users
        SET status = $1
        WHERE id = $2
        `,
        [
          status,
          id
        ]
      );


      res.json({
        success:true,
        message:"User status updated"
      });


    }catch(error){

      console.log(error);

      res.status(500).json({
        success:false
      });

    }

});

/* =========================
   ADMIN VERIFY INFLUENCERS
========================= */


app.get(
  "/api/admin/influencers",
  async(req,res)=>{

    try{


      const result =
      await pool.query(
        `
        SELECT *
        FROM influencer_profiles
        ORDER BY id DESC
        `
      );


      res.json({
        success:true,
        influencers:result.rows
      });



    }catch(error){

      console.log(error);

      res.status(500).json({
        success:false
      });

    }

});



app.put(
  "/api/admin/influencers/:id",
  async(req,res)=>{


    try{


      const {id}=req.params;

      const {verification_status}=req.body;



      await pool.query(
        `
        UPDATE influencer_profiles
        SET verification_status=$1
        WHERE id=$2
        `,
        [
          verification_status,
          id
        ]
      );



      res.json({
        success:true,
        message:"Verification updated"
      });



    }catch(error){


      console.log(error);

      res.status(500).json({
        success:false
      });


    }

});

app.put(
"/api/admin/influencers/:id/verify",
async(req,res)=>{

try{

const {id}=req.params;

const {status}=req.body;


await pool.query(
`
UPDATE influencer_profiles
SET verification_status=$1
WHERE id=$2
`,
[
status,
id
]
);


res.json({
success:true,
message:"Verification updated"
});


}catch(error){

console.log(error);

res.status(500).json({
success:false
});

}

});

app.get("/api/admin/categories", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM categories ORDER BY id ASC`
    );

    res.json({
      success: true,
      categories: result.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

app.post("/api/admin/categories", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Category name required",
      });
    }

    const result = await pool.query(
      `INSERT INTO categories(name)
       VALUES($1)
       RETURNING *`,
      [name]
    );

    res.json({
      success: true,
      category: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

app.delete("/api/admin/categories/:id", async (req,res)=>{

try{

const {id}=req.params;


await pool.query(
`DELETE FROM categories WHERE id=$1`,
[id]
);


res.json({
success:true,
message:"Category deleted"
});


}catch(error){

console.log(error);

res.status(500).json({
success:false
});

}

});

app.get("/api/admin/analytics", async(req,res)=>{

try{


const users =
await pool.query(
"SELECT COUNT(*) FROM users"
);


const influencers =
await pool.query(
"SELECT COUNT(*) FROM influencer_profiles"
);


const categories =
await pool.query(
"SELECT COUNT(*) FROM categories"
);



const verified =
await pool.query(
`
SELECT COUNT(*)
FROM influencer_profiles
WHERE verification_status='Verified'
`
);



const pending =
await pool.query(
`
SELECT COUNT(*)
FROM influencer_profiles
WHERE verification_status='Pending'
`
);



res.json({

success:true,

analytics:{

users:
Number(users.rows[0].count),

influencers:
Number(influencers.rows[0].count),

categories:
Number(categories.rows[0].count),

verified:
Number(verified.rows[0].count),

pending:
Number(pending.rows[0].count)

}

});


}catch(error){

console.log(error);

res.status(500).json({
success:false
});

}


});


app.get(
  "/api/notifications/:userId",
  async (req, res) => {

    try {

      const result = await pool.query(
        `
        SELECT *
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        `,
        [req.params.userId]
      );

      res.json({
        success: true,
        notifications: result.rows
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch notifications"
      });

    }

  }
);

/* =========================
   SERVER START
========================= */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Setup a dedicated listener client for Postgres LISTEN/NOTIFY
let listenerClient;

async function setupListener(){

  try {

    listenerClient = await pool.connect();

    await listenerClient.query(
      "LISTEN influencers_channel"
    );

    listenerClient.on(
      "notification",
      () => {

        broadcastInfluencers();

      }
    );

    console.log(
      "LISTEN setup on influencers_channel"
    );


  } catch(error){

    console.log(
      "Listener error",
      error
    );

  }

}


setupListener();