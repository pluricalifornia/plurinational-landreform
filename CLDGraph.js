import React, { useRef, useEffect } from "react";
import ForceGraph2D from "react-force-graph-2d";

const nodes = [
  { id: "Research & Analysis" },
  { id: "Community Engagement" },
  { id: "Policy Collaboration" },
  { id: "Policy Advocacy" },
  { id: "Rural Funding Shift" },
  { id: "Support Ventures" },
  { id: "Acquire Land" },
  { id: "Develop Value-Adding Infrastructure" },
  { id: "Community Capital Retention" },
  { id: "Economic Development" },
];

const links = [
  { source: "Research & Analysis", target: "Community Engagement" },
  { source: "Research & Analysis", target: "Policy Collaboration" },
  { source: "Community Engagement", target: "Policy Advocacy" },
  { source: "Policy Collaboration", target: "Policy Advocacy" },
  { source: "Policy Advocacy", target: "Rural Funding Shift" },
  { source: "Rural Funding Shift", target: "Support Ventures" },
  { source: "Support Ventures", target: "Acquire Land" },
  { source: "Support Ventures", target: "Develop Value-Adding Infrastructure" },
  { source: "Acquire Land", target: "Community Capital Retention" },
  { source: "Acquire Land", target: "Economic Development" },
  { source: "Develop Value-Adding Infrastructure", target: "Community Capital Retention" },
  { source: "Develop Value-Adding Infrastructure", target: "Economic Development" },
  { source: "Community Capital Retention", target: "Economic Development" },
  { source: "Economic Development", target: "Support Ventures" },
];

const CLDGraph = () => {
  const nodeRelSize = 6;
  const fgRef = useRef();

  useEffect(() => {
    if (fgRef.current) {
      // Wait for a short delay to ensure graph is ready before zooming
      const timeout = setTimeout(() => {
        fgRef.current.zoomToFit(400, 80);
      }, 100);

      return () => clearTimeout(timeout);
    }
  }, []);

  return (
    <div className="h-[1000px]">
      <h1 className="text-3xl font-bold text-center mb-4">
        Causal Loop Diagram: Advancing Land Equity
      </h1>
      <ForceGraph2D
        ref={fgRef}
        graphData={{ nodes, links }}
        nodeAutoColorBy="id"
        nodeLabel="id"
        nodeRelSize={nodeRelSize}
        nodeCanvasObjectMode={() => "after"}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const label = node.id;
          const fontSize = 14 / globalScale;
          ctx.font = `${fontSize}px Sans-Serif`;
          ctx.fillStyle = "black";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, node.x, node.y - nodeRelSize * 1.5);
        }}
        linkDirectionalArrowLength={6}
        linkDirectionalArrowRelPos={1}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.005}
        cooldownTicks={100}
        d3AlphaDecay={0.01}
        d3VelocityDecay={0.2}
        d3Force="charge"
        d3ForceStrength={-400}
      />
    </div>
  );
};

export default CLDGraph;
