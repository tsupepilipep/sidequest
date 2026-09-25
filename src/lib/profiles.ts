import { getServiceClient } from "@/lib/supabase/server";
import { randomNickname } from "@/lib/nicknames";

const MAX_ATTEMPTS = 8;

/**
 * Make sure a browser has a nickname and return it. Names are unique, so on
 * a collision we simply try another one; the name space is far bigger than
 * the user base.
 */
export async function ensureNickname(browserId: string): Promise<string> {
  const supabase = getServiceClient();
  const existing = await supabase
    .from("profiles")
    .select("nickname")
    .eq("browser_id", browserId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data.nickname as string;
  return setNickname(browserId, false);
}

/** Give a browser a fresh random nickname, replacing any existing one. */
export async function setNickname(browserId: string, replace: boolean): Promise<string> {
  const supabase = getServiceClient();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const nickname = randomNickname();
    const { error } = replace
      ? await supabase.from("profiles").upsert({ browser_id: browserId, nickname })
      : await supabase.from("profiles").insert({ browser_id: browserId, nickname });
    if (!error) return nickname;
    // 23505 = unique_violation: either the nickname is taken (try again) or,
    // when inserting, someone raced us on the browser id (read it back).
    if (error.code !== "23505") throw new Error(error.message);
    if (!replace) {
      const { data } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("browser_id", browserId)
        .maybeSingle();
      if (data) return data.nickname as string;
    }
  }
  throw new Error("Could not find a free nickname");
}
