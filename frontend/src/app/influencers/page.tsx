"use client";

import { useEffect, useState } from "react";
import InfluencerCard from "@/modules/home/components/InfluencerCard";

export default function InfluencersPage() {

  const [influencers, setInfluencers] =
    useState<any[]>([]);

  const [search, setSearch] =
    useState("");

  useEffect(() => {

    fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/influencers`
    )
      .then((res) => res.json())
    .then((data) => {
  if (!data.success) {
    setInfluencers([]);
    return;
  }

  setInfluencers(data.influencers || []);
})
      .catch((error) => {

        console.log(error);

        setInfluencers([]);

      });

  }, []);

  const filteredInfluencers =
  influencers.filter(
    (influencer: any) => {

      const text =
        search.toLowerCase();

     const words =
  text
    .split(" ")
    .filter(
      (word) =>
        ![
          "in",
          "influencer",
          "influencers",
          "creator",
          "creators",
          "for",
          "the",
        ].includes(word)
    );

      return words.every(
        (word) =>

          influencer.name
            ?.toLowerCase()
            .includes(word)

          ||

          influencer.city
            ?.toLowerCase()
            .includes(word)

          ||

          influencer.category
            ?.toLowerCase()
            .includes(word)

          ||

          influencer.bio
            ?.toLowerCase()
            .includes(word)
      );

    }
  );
  const suggestions = [
  ...new Set([
    ...influencers.map(
      (i) =>
        `${i.category} Influencers in ${i.city}`
    ),
    ...influencers.map(
      (i) => i.city
    ),
    ...influencers.map(
      (i) => i.category
    ),
  ]),
]
.filter((item) =>
  item
    .toLowerCase()
    .includes(search.toLowerCase())
)
.slice(0, 5);
  return (

    <main className="max-w-7xl mx-auto px-6 py-20">

      <div className="mb-14">

        <h1 className="text-6xl font-bold mb-4">
          Explore Influencers
        </h1>

        <p className="text-xl text-gray-600 mb-8">
          Discover creators across India.
        </p>

       <div className="relative">

  <input
    type="text"
    placeholder="Search by name, city, category or bio..."
    value={search}
    onChange={(e) =>
      setSearch(e.target.value)
    }
    className="w-full border border-gray-300 rounded-2xl px-6 py-4 outline-none focus:border-black"
  />

  {search && suggestions.length > 0 && (

    <div className="absolute w-full bg-white border rounded-2xl shadow-lg mt-2 z-50">

      {suggestions.map(
        (item, index) => (

          <button
            key={index}
            onClick={() =>
              setSearch(item)
            }
            className="w-full text-left px-4 py-3 hover:bg-gray-100"
          >
            {item}
          </button>

        )
      )}

    </div>

  )}

</div>

      </div>

      <p className="text-gray-500 mb-8">
        {filteredInfluencers.length} influencers found
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10">

        {filteredInfluencers.map(
          (influencer: any) => (

            <InfluencerCard
              key={influencer.id}
              id={influencer.id}
              name={influencer.name}
              category={influencer.category}
              followers_count={influencer.followers_count ?? influencer.followers}
              city={influencer.city}
              instagram={influencer.instagram}
              image={influencer.image}
            />

          )
        )}

      </div>


      {filteredInfluencers.length === 0 && (

        <div className="text-center py-20">

          <h2 className="text-3xl font-bold mb-3">
            No Influencers Found
          </h2>

          <p className="text-gray-500">
            Try searching with a different keyword.
          </p>

        </div>

      )}

    </main>

  );

}