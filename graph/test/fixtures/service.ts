// Named imports
import { User, Order } from "./models.ts";
// Aliased import
import { formatName as fmt } from "./utils.ts";
// Namespace import
import * as Utils from "./utils.ts";
// Side-effect import
import "./side-effect.ts";

export function createUser(name: string): User {
  return { id: "1", name: fmt("John", name) };
}

export function getOrders(): Order[] {
  const _valid = Utils.validateEmail("test@test.com");
  return [];
}
