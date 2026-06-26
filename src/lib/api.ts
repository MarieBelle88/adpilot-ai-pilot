// Live backend API client
export const API_BASE_URL = "https://af56413de78d3a.lhr.life";

export type SnapshotCampaign = {
  id: string;
  name: string;
  status: string;
  budget: number;
};

export type SnapshotKeyword = {
  id: string;
  text: string;
  clicks: number;
  spend: number;
  conversions: number;
  status: string;
};

export type Snapshot = {
  campaigns: SnapshotCampaign[];
  keywords: SnapshotKeyword[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export function fetchSnapshot(): Promise<Snapshot> {
  return request<Snapshot>("/api/snapshot");
}

export function pauseKeyword(keywordId: string) {
  return request<{ status: string; message: string }>(
    `/api/action/pause-keyword?keyword_id=${encodeURIComponent(keywordId)}`,
    { method: "POST" },
  );
}
