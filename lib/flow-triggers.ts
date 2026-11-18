import type { Json, TriggerType } from "@/lib/types/database";

/** The trigger types the flow builder owns. Growth-tab rows are channel-scoped
 *  and are never produced (or reconciled) from a node graph. */
export const BUILDER_TRIGGER_TYPES = [
  "keyword",
  "postback",
  "quick_reply",
  "welcome",
  "default",
  "comment_keyword",
] as const;

type BuilderTriggerType = (typeof BUILDER_TRIGGER_TYPES)[number];

const isBuilderTriggerType = (t: string): t is BuilderTriggerType =>
  (BUILDER_TRIGGER_TYPES as readonly string[]).includes(t);

export interface DesiredTrigger {
  flow_id: string;
  channel_id: null;
  type: TriggerType;
  config: Json;
  is_active: boolean;
  priority: number;
}

/**
 * Derive the `triggers` rows a published flow should have from its node graph.
 *
 * One node usually maps to one row. The exception is a `comment_keyword` node
 * with "also match in DMs", which emits a second row typed `keyword`: the
 * runtime matcher keys the DM path off that type, so this is what lets one flow
 * answer both a comment and a DM carrying the same keyword.
 */
export function buildDesiredTriggers(
  flowNodes: Array<Record<string, unknown>>,
  flowId: string,
): DesiredTrigger[] {
  return flowNodes
    .filter((n) => n?.type === "trigger")
    .flatMap((n) => {
      const data = (n.data ?? {}) as Record<string, any>;
      const nodeConfig = (data.config ?? {}) as Record<string, any>;
      const type = (data.triggerType ?? "keyword") as string;
      if (!isBuilderTriggerType(type)) return [];

      // The trigger panel stores keywords as data.keywords ([{ value, matchType }]);
      // template-seeded nodes store data.config.keywords ([string]). The matcher
      // accepts both shapes, so pass through whichever the node carries.
      const config: Record<string, any> = {};
      if (type === "keyword" || type === "comment_keyword") {
        config.keywords = data.keywords ?? nodeConfig.keywords ?? [];
        if (nodeConfig.matchType) config.matchType = nodeConfig.matchType;
        const postIds = data.postIds ?? nodeConfig.postIds;
        if (Array.isArray(postIds) && postIds.length > 0) config.postIds = postIds;
        const replyText = data.replyText ?? nodeConfig.replyText;
        if (typeof replyText === "string" && replyText.trim() && data.replyEnabled !== false) {
          config.replyText = replyText;
        }
        if (type === "comment_keyword") {
          // ManyChat-style comment trigger options (see CommentTriggerWizard).
          config.nodeId = n.id;
          const scope = data.postScope;
          if (scope === "specific" || scope === "any" || scope === "next") config.postScope = scope;
          if (scope === "any") delete config.postIds;
          if (scope === "next") {
            delete config.postIds;
            config.knownPostIds = Array.isArray(data.knownPostIds) ? data.knownPostIds : [];
          }
          if (data.anyComment === true) config.anyComment = true;
          if (Array.isArray(data.excludeKeywords) && data.excludeKeywords.length > 0) {
            config.excludeKeywords = data.excludeKeywords;
          }
        }
      } else if (type === "postback" || type === "quick_reply") {
        const payload = data.payload ?? nodeConfig.payload;
        if (payload !== undefined) config.payload = payload;
      }

      const row: DesiredTrigger = {
        flow_id: flowId,
        channel_id: null,
        type: type as TriggerType,
        config,
        is_active: true,
        priority: typeof nodeConfig.priority === "number" ? nodeConfig.priority : 0,
      };

      // postIds (post scoping) and replyText (the public reply on the comment)
      // are dropped from the DM row: a DM has neither a post nor a comment.
      if (type === "comment_keyword" && data.alsoMatchInDms === true && config.keywords?.length) {
        const {
          postIds: _postIds,
          replyText: _replyText,
          postScope: _postScope,
          knownPostIds: _knownPostIds,
          anyComment: _anyComment,
          excludeKeywords: _excludeKeywords,
          nodeId: _nodeId,
          ...dmConfig
        } = config;
        return [row, { ...row, type: "keyword" as TriggerType, config: dmConfig }];
      }

      return [row];
    });
}
