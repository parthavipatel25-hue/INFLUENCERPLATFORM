"use client";

import { useState } from "react";

export default function CreateCampaign() {

  const [title, setTitle] =
    useState("");

  const [budget, setBudget] =
    useState("");

  const [category, setCategory] =
    useState("");
  const [categories, setCategories] = useState<any[]>([]);

  const [description, setDescription] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const handleSubmit = async (
    e: React.FormEvent
  ) => {

    e.preventDefault();

    try {

      setLoading(true);

      const user = JSON.parse(
        localStorage.getItem("user") || "{}"
      );

      console.log(
        "Logged In User:",
        user
      );

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/campaigns`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            brand_id: user.id,
            title,
            budget,
            category,
            description,
          }),
        }
      );

      const data =
        await response.json();

      console.log(data);

      if (data.success) {

        alert(
          "Campaign created successfully!"
        );

        setTitle("");
        setBudget("");
        setCategory("Food");
        setDescription("");

      } else {

        alert(
          data.message ||
          "Failed to create campaign"
        );

      }

    } catch (error) {

      console.log(error);

      alert(
        "Something went wrong"
      );

    } finally {

      setLoading(false);

    }

  };

  return (

    <main className="min-h-screen bg-gray-100 p-10">

      <div className="max-w-4xl mx-auto bg-white p-10 rounded-3xl shadow-sm">

        <div className="mb-10">

          <h1 className="text-5xl font-bold mb-3">
            Create Campaign
          </h1>

          <p className="text-gray-500 text-lg">
            Launch a new influencer
            marketing campaign.
          </p>

        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-8"
        >

          <div>

            <label className="block mb-3 font-semibold">
              Campaign Title
            </label>

            <input
              type="text"
              value={title}
              onChange={(e) =>
                setTitle(e.target.value)
              }
              placeholder="Nike Summer Collection"
              className="w-full border border-gray-300 rounded-2xl px-5 py-4"
              required
            />

          </div>

          <div>

            <label className="block mb-3 font-semibold">
              Budget
            </label>

            <input
              type="text"
              value={budget}
              onChange={(e) =>
                setBudget(e.target.value)
              }
              placeholder="₹50,000"
              className="w-full border border-gray-300 rounded-2xl px-5 py-4"
              required
            />

          </div>

          <div>

            <label className="block mb-3 font-semibold">
              Category
            </label>
<select
  value={category}
  onChange={(e) => setCategory(e.target.value)}
  className="w-full border border-gray-300 rounded-2xl px-5 py-4 outline-none focus:border-black"
>
  <option value="">Select Category</option>

  {categories?.length > 0 &&
    categories.map((cat, index) => (
      <option
        key={cat.id || index}
        value={cat.name || cat}
      >
        {cat.name || cat}
      </option>
    ))}
</select>


          </div>

          <div>

            <label className="block mb-3 font-semibold">
              Description
            </label>

            <textarea
              rows={5}
              value={description}
              onChange={(e) =>
                setDescription(
                  e.target.value
                )
              }
              placeholder="Describe your campaign..."
              className="w-full border border-gray-300 rounded-2xl px-5 py-4"
            />

          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-black text-white px-8 py-4 rounded-2xl hover:opacity-90 transition"
          >

            {loading
              ? "Creating..."
              : "Create Campaign"}

          </button>

        </form>

      </div>

    </main>

  );

}