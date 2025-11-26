"use client";

import Link from "next/link";
import { SearchInput } from "./search-input";
import { type SearchMode, type SearchVideoResponse } from "@/lib/types";
import { useRef, useState } from "react";
import { Loader } from "lucide-react";
import { SearchResult } from "./search-result";

export const YouTubeSearch = () => {
  const [query, setQuery] = useState<string>("");
  const [mode, setMode] = useState<SearchMode>("Search");
  const [searchResponse, setSearchResponse] = useState<
    SearchVideoResponse | undefined
  >();
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const abortControllerRef = useRef<AbortController>(null);

  const handleSearch = async (query: string, mode: SearchMode) => {
    setQuery(query);
    setMode(mode);
    setLoading(true);
    setSearchResponse(undefined);
    setErrorText("");

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 为当前请求创建一个新的 AbortController
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await fetch("/api/search-video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, mode }),
        signal: abortControllerRef.current.signal,
      });

      if (result.ok) {
        setSearchResponse(await result.json());
      } else {
        if (result.status === 429) {
          setErrorText("You have exceeded the rate limit. Retry later.");
        } else {
          setErrorText("Failed to search video. Please try again.");
        }
      }
    } catch (error) {
      if ((error as any).name !== "AbortError") {
        setErrorText("Failed to search video. Please try again.");
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  };

  return (
    <main className="container min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col justify-center py-12 max-w-4xl mx-auto">
        <div className="w-full">
          <h1 className="text-center text-2xl md:text-3xl mb-4 font-medium">
            TubeSeek
          </h1>
          <p className="text-sm md:text-base mb-6 text-center">
            YouTube Search Engine - Search what's said and shown in videos.{" "}
            <span className="font-semibold">50,000+</span> High-quality YouTube
            videos covering technology, healthcare, education, finance, and
            e-commerce, and growing rapidly. Powered by{" "}
            <Link
              href="https://www.vizlook.com/"
              target="_blank"
              className="underline hover:opacity-70"
            >
              Vizlook
            </Link>
            .
          </p>
          <div>
            <SearchInput onSearch={handleSearch} />
          </div>
        </div>
        <div className="flex items-center justify-center mt-10">
          {loading ? (
            <Loader className="animate-spin" size={32} />
          ) : searchResponse ? (
            <SearchResult
              query={query}
              mode={mode}
              searchResponse={searchResponse}
            />
          ) : errorText ? (
            <div className="text-red-500 text-base font-medium text-center">
              {errorText}
            </div>
          ) : null}
        </div>
      </div>
      <div className="w-full h-[3.5rem] footer-placehold"></div>
    </main>
  );
};
