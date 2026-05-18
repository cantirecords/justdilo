"use client";
import { createContext, useContext, useEffect, useState } from "react";

type Features = Record<string, boolean>;

const FeaturesContext = createContext<Features>({});

export function FeaturesProvider({ children }: { children: React.ReactNode }) {
  const [features, setFeatures] = useState<Features>({});

  useEffect(() => {
    fetch("/api/features")
      .then((r) => r.json())
      .then(({ features }) => setFeatures(features ?? {}))
      .catch(() => {});
  }, []);

  return <FeaturesContext.Provider value={features}>{children}</FeaturesContext.Provider>;
}

export function useFeature(key: string): boolean {
  return useContext(FeaturesContext)[key] === true;
}
