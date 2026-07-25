export interface GlobalEquivalentDomainGroup {
  id: number;
  name: string;
  domains: string[];
}

export const GLOBAL_EQUIVALENT_DOMAINS: readonly GlobalEquivalentDomainGroup[] = [
  { id: 1, name: "Google", domains: ["google.com", "gmail.com", "youtube.com"] },
  { id: 2, name: "Apple", domains: ["apple.com", "icloud.com"] },
  { id: 3, name: "Microsoft", domains: ["microsoft.com", "live.com", "outlook.com"] },
  { id: 4, name: "Amazon", domains: ["amazon.com", "amazon.cn", "amazon.co.jp"] },
  { id: 5, name: "Yahoo", domains: ["yahoo.com", "flickr.com"] },
  { id: 6, name: "Proton", domains: ["proton.me", "protonmail.com"] },
] as const;
