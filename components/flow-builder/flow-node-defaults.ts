/** Ids and starting data for new builder steps (shared by the canvas and the step pickers). */
let nodeId = 0;
export function getNodeId() {
  return `node_${Date.now()}_${nodeId++}`;
}

export function getDefaultData(type: string, actionType?: string): Record<string, unknown> {
  switch (type) {
    case "trigger":
      return { triggerType: "keyword", keywords: [] };
    case "sendMessage":
      return { messages: [] };
    case "condition":
      return { conditions: [], logic: "and" };
    case "delay":
      return { duration: 5, unit: "minutes" };
    case "note":
      return { text: "" };
    case "actions":
      return { actions: [] };
    case "aiResponse":
      return { systemPrompt: "", model: "openai/gpt-4o-mini", temperature: 0.7, maxTokens: 500, contextMessages: 10 };
    case "action":
      if (actionType === "abSplit") {
        return {
          actionType,
          randomPath: false,
          paths: [
            { name: "A", weight: 50 },
            { name: "B", weight: 50 },
          ],
        };
      }
      if (actionType === "collectInput") {
        return { actionType, question: "", inputType: "email", variableName: "email" };
      }
      return { actionType: actionType || "addTag" };
    default:
      return {};
  }
}

