export const MAX_TODO_ITEMS = 15;

export function formatTodoItemRange(): string {
  return `1-${MAX_TODO_ITEMS}`;
}

export function formatTodoPlanGateReason(): string {
  return `Plan gate requires todo.create_todo_list with ${formatTodoItemRange()} items before mutating actions.`;
}

export function formatPlanPhaseTodoGuidance(): string {
  return `In plan, create a short ${formatTodoItemRange()} item todo list. Add verification goal and commands when you know them, but do not block progress on that alone.`;
}

export function formatPlannerTodoHint(): string {
  return `Consider creating a todo plan with ${formatTodoItemRange()} items before further exploration.`;
}
