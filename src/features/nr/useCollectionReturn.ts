import { useEffect, useRef, type MouseEvent } from "react";
import { useOrg } from "@/features/org/session";

/** Complements router scroll restoration when the explicit “Voltar à lista” is used. */
export function useCollectionReturn<T extends HTMLElement = HTMLUListElement>(
  identity: string,
  context: string,
) {
  const ref = useRef<T>(null);
  const session = useOrg();
  const storage = `nexus.nr.collection-return.v1:${session.data?.userId || ""}:${session.data?.orgId || ""}:${identity}`;
  useEffect(() => {
    let frame = 0;
    let next = 0;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storage) || "null") as {
        context: string;
        record: string;
        scroll: number;
        captured: number;
      } | null;
      if (!saved || saved.context !== context || Date.now() - saved.captured > 30 * 60_000) return;
      sessionStorage.removeItem(storage);
      frame = requestAnimationFrame(() => {
        next = requestAnimationFrame(() => {
          const card = [
            ...(ref.current?.querySelectorAll<HTMLElement>("[data-record-id]") || []),
          ].find((element) => element.dataset["recordId"] === saved.record);
          if (!card) return;
          card.querySelector<HTMLAnchorElement>("a[href]")?.focus({ preventScroll: true });
          window.scrollTo({ top: saved.scroll, behavior: "instant" });
        });
      });
    } catch {
      /* Storage can be unavailable; all links still work. */
    }
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(next);
    };
  }, [storage, context]);
  function onClickCapture(event: MouseEvent<T>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest("a[href]");
    const card = link?.closest<HTMLElement>("[data-record-id]");
    if (!card || !ref.current?.contains(card)) return;
    try {
      sessionStorage.setItem(
        storage,
        JSON.stringify({
          context,
          record: card.dataset["recordId"],
          scroll: window.scrollY,
          captured: Date.now(),
        }),
      );
    } catch {
      /* Router restoration remains available. */
    }
  }
  return { ref, onClickCapture };
}
