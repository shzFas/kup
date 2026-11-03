import { cache } from "react";
import { cookies, headers } from "next/headers";
import { pickLang, type Lang } from "@kup/shared";
import { LANG_COOKIE, isLang, translator, type Translator } from "./core";

/** UI language for this request: `lang` cookie, else the best match from Accept-Language. */
export const getLangInfo = cache(async (): Promise<{ lang: Lang; explicit: boolean }> => {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(c)) return { lang: c, explicit: true };
  return { lang: pickLang((await headers()).get("accept-language")), explicit: false };
});

export async function getLang(): Promise<Lang> {
  return (await getLangInfo()).lang;
}

export async function getI18n(): Promise<Translator> {
  return translator(await getLang());
}
