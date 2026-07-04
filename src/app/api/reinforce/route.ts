import { NextResponse } from "next/server";
import type { Graph } from "@/engine";
import type { DecisionContextPack } from "@/context";
import { suggestReinforcement } from "@/llm/reinforce";

// POST { graph, pack? } → { suggestion, source }. NEVER 500s: any bad body or live failure
// degrades to a deterministic fixture suggestion (suggestReinforcement itself never throws;
// this handler adds one more guard around JSON parsing). Provenance also rides on a header,
// matching /api/attacks and /api/extract.
export async function POST(req: Request) {
  try {
    const { graph, pack } = (await req.json()) as {
      graph?: Graph;
      pack?: DecisionContextPack;
    };
    if (!graph || !Array.isArray(graph.nodes)) {
      return NextResponse.json(
        {
          suggestion:
            "Identify the single assumption everything rests on, then design the cheapest test that could falsify it first.",
          source: "fixture",
        },
        { headers: { "x-keystone-source": "fixture" } },
      );
    }
    const { suggestion, source } = await suggestReinforcement(graph, pack);
    return NextResponse.json({ suggestion, source }, { headers: { "x-keystone-source": source } });
  } catch {
    return NextResponse.json(
      {
        suggestion:
          "Identify the single assumption everything rests on, then design the cheapest test that could falsify it first.",
        source: "fixture",
      },
      { headers: { "x-keystone-source": "fixture" } },
    );
  }
}
