import type { RelationshipSummary, RuleViolationSummary } from "../functions/run/models/report";
import type { Rule } from "../model/config";

export function checkRules(
  rules: Rule[],
  relationships: RelationshipSummary[],
): RuleViolationSummary[] {
  const violations: RuleViolationSummary[] = [];

  for (const rule of rules) {
    for (const relationship of relationships) {
      if (relationship.from === rule.from && relationship.to === rule.to) {
        violations.push({
          rule: rule.type,
          from: rule.from,
          to: rule.to,
          relationshipType: relationship.type,
        });
      }
    }
  }

  return violations;
}
