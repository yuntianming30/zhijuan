import { useEffect, useRef } from "react";
import { parse } from "@markmap/parse";
import { createClassicTheme } from "@markmap/render";
import { Markmap } from "@markmap/view";
import type { DemoKnowledgeGraph, ReviewDepth } from "../types";
import { ZoomIn, ZoomOut, Scan } from "lucide-react";

interface MindMapViewProps {
  graph: DemoKnowledgeGraph;
  depth: ReviewDepth;
}

function markdownForDepth(
  graph: DemoKnowledgeGraph,
  depth: ReviewDepth,
  compact: boolean,
) {
  const allowed =
    depth === "quick"
      ? new Set(["core"])
      : depth === "focused"
        ? new Set(["core", "important"])
        : new Set(["core", "important", "normal"]);

  const lines = [`# ${graph.course}`];
  if (!compact) {
    lines.push(`## ${graph.language} / ${graph.framework}`);
  }
  for (const branch of graph.branches) {
    lines.push(`${compact ? "##" : "###"} ${branch.title}`);
    for (const node of graph.nodes.filter(
      (item) => item.branch === branch.id && allowed.has(item.importance),
    )) {
      lines.push(`${compact ? "###" : "####"} ${node.title}`);
      if (!compact && depth !== "quick") {
        lines.push(
          ...node.summary
            .split("；")
            .filter(Boolean)
            .map((part) => `- ${part.trim()}`),
        );
      }
    }
  }

  if (depth === "complete") {
    lines.push(`${compact ? "##" : "###"} 易错提醒`);
    for (const warning of graph.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}

export default function MindMapView({
  graph,
  depth,
}: MindMapViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const markmapRef = useRef<Markmap | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const isCompact = window.matchMedia("(max-width: 720px)").matches;
    const { root } = parse(markdownForDepth(graph, depth, isCompact));
    markmapRef.current?.destroy();
    const markmap = Markmap.create(
      svgRef.current,
      root,
      {
        duration: 260,
        fitPadding: isCompact ? 10 : 22,
        fitMaxScale: isCompact ? 1.2 : 1.05,
        foldLevel: isCompact ? 3 : 4,
        levelGap: isCompact ? 18 : 24,
        siblingGap: isCompact ? 6 : 9,
        wrapWidth: isCompact ? 128 : 210,
        colorScheme: "light",
        theme: createClassicTheme({
          color: ["#137769", "#c56a2d", "#315d84", "#a4463d", "#7a6b34"],
          colorDepth: isCompact ? 2 : 3,
        }),
      },
    );
    markmapRef.current = markmap;
    const timer = window.setTimeout(() => markmap.fit(), 120);

    return () => {
      window.clearTimeout(timer);
      markmap.destroy();
      markmapRef.current = null;
    };
  }, [depth, graph]);

  return (
    <div className="mindmap-wrap">
      <svg
        ref={svgRef}
        className="mindmap-svg"
        role="img"
        aria-label={`${graph.course}复习思维导图`}
      />
      <div className="map-toolbar" role="toolbar" aria-label="导图缩放">
        <button
          type="button"
          className="icon-button"
          aria-label="缩小导图"
          title="缩小导图"
          onClick={() => markmapRef.current?.zoomBy(0.85)}
        >
          <ZoomOut size={17} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="适应画布"
          title="适应画布"
          onClick={() => markmapRef.current?.fit()}
        >
          <Scan size={17} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="放大导图"
          title="放大导图"
          onClick={() => markmapRef.current?.zoomBy(1.15)}
        >
          <ZoomIn size={17} />
        </button>
      </div>
    </div>
  );
}
