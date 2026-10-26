import { useEffect, useRef, useState } from "react";

import { FormRenderer } from "@/forms/FormRenderer";
import type { FormDef, TemplateId } from "@/forms/types";

const PAGE_WIDTH = 720;

/** A live, scaled-down picture of a form in a given design (not clickable inside). */
export function TemplateThumb({
  template,
  def,
  accent,
}: {
  template: TemplateId;
  def: FormDef;
  accent?: string | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.28);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / PAGE_WIDTH));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="tpl-thumb" ref={box} aria-hidden="true">
      <div
        className="tpl-thumb-page"
        style={{ width: PAGE_WIDTH, transform: `scale(${scale})` }}
        inert
      >
        <FormRenderer def={def} template={template} accent={accent ?? null} mode="preview" />
      </div>
    </div>
  );
}
