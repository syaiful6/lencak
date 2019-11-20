import * as H from './genjer'
import {set, assign} from './utils';

export interface Todo {
  text: string;
  completed: boolean;
  editing: boolean;
  id: number;
}

export interface Todos {
  todos: Todo[];
  pending: string;
  fresh: number;
  visibility: Visibility
}

export interface StoredTodos {
  todos: Todo[];
  fresh: number;
}

export const enum Visibility {
  ALL,
  ACTIVE,
  COMPLETED
}

export const enum TodoActionType {
  NONE,
  UPDATEPENDING,
  ADDTODO,
  UPDATETODO,
  TOGGLETODO,
  EDITINGTODO,
  DELETETODO,
  DELETECOMPLETED,
  TOGGLEALL,
  CHANGEVISIBILITY
}

export type TodoAction
  = { tag: TodoActionType.NONE }
  | { tag: TodoActionType.UPDATEPENDING; payload: string }
  | { tag: TodoActionType.ADDTODO }
  | { tag: TodoActionType.UPDATETODO; payload: { ix: number; text: string } }
  | { tag: TodoActionType.TOGGLETODO; payload: { ix: number, completed: boolean } }
  | { tag: TodoActionType.EDITINGTODO; payload: { ix: number, editing: boolean } }
  | { tag: TodoActionType.DELETETODO; payload: number }
  | { tag: TodoActionType.DELETECOMPLETED }
  | { tag: TodoActionType.TOGGLEALL; payload: boolean }
  | { tag: TodoActionType.CHANGEVISIBILITY; payload: Visibility };

export class WriteStorage<A> {
  constructor(readonly model: Todos, readonly value: A) {
  }

  map<B>(f: (_: A) => B): WriteStorage<B> {
    return new WriteStorage(this.model, f(this.value))
  }
}

function toStorage(model: Todos): H.Transition<WriteStorage<TodoAction>, Todos, TodoAction> {
  return H.transition(model, [ new WriteStorage(model, { tag: TodoActionType.NONE }) ] as WriteStorage<TodoAction>[])
}

export function update(model: Todos, action: TodoAction): H.Transition<WriteStorage<TodoAction>, Todos, TodoAction> {
  let todos: Todos, xs: Todo[];
  switch (action.tag) {
    case TodoActionType.NONE:
      return H.purely(model);

    case TodoActionType.UPDATEPENDING:
      return H.purely(set('pending', action.payload, model));

    case TodoActionType.ADDTODO:
      xs = model.pending === '' ? model.todos : snocArr(model.todos, newTodo(model.pending, model.fresh));
      return toStorage(assign({}, model, {
        todos: xs,
        pending: '',
        fresh: model.fresh + 1
      }))

    case TodoActionType.UPDATETODO:
      todos = set(
        'todos',
        modifyWhere(
          x => action.payload.ix === x.id,
          x => set('text', action.payload.text, x),
          model.todos
        ),
        model
      );
      return toStorage(todos);

    case TodoActionType.TOGGLETODO:
      todos = set(
        'todos',
        modifyWhere(
          x => action.payload.ix === x.id,
          x => set('completed', action.payload.completed, x),
          model.todos
        ),
        model
      );
      return toStorage(todos);

    case TodoActionType.EDITINGTODO:
      todos = set(
        'todos',
        modifyWhere(
          x => action.payload.ix === x.id,
          x => set('editing', action.payload.editing, x),
          model.todos
        ),
        model
      );
      return toStorage(todos);

    case TodoActionType.DELETETODO:
      todos = set(
        'todos',
        model.todos.filter(x => x.id !== action.payload),
        model
      );
      return toStorage(todos);

    case TodoActionType.DELETECOMPLETED:
      todos = set(
        'todos',
        model.todos.filter(x => x.completed === false),
        model
      );
      return toStorage(todos);

    case TodoActionType.TOGGLEALL:
      todos = set(
        'todos',
        model.todos.map(x => set('completed', true, x)),
        model
      );
      return toStorage(todos);

    case TodoActionType.CHANGEVISIBILITY:
      return H.purely(set('visibility', action.payload, model));
  }
}

export function render(todos: Todos): H.VNode<TodoAction> {
  return H.h('div.todomvc-wrapper',
    [ H.h('section.todoapp',
        [ H.lazy('header.header', todos.pending, renderInput)
        , H.lazy2('section.main', todos.visibility, todos.todos, renderTodos)
        , H.lazy2('footer.footer', todos.visibility, todos.todos, renderControl)
        ]
      )
    , H.lazy('footer.info', void 0, infoFooter)
    ]
  );
}

function renderInput(text: string): H.VNode<TodoAction> {
  return H.h('header.header',
    [ H.h<TodoAction>('h1', 'todos')
    , H.h('input.new-todo',
        { attrs:
            { placeholder: 'What needs to be done?'
            }
        , props:
            { value: text
            , type: 'text'
            , autofocus: true
            , name: 'newTodo'
            }
        , events:
            { input: updatePending
            , keyup: H.onKey(
                selectKeyOrEscape,
                watchInput(
                    { tag: TodoActionType.ADDTODO },
                    { tag: TodoActionType.UPDATEPENDING, payload: '' }
                  ))
            }
        }
      )
  ]);
}

function renderTodos(visibility: Visibility, todos: Todo[]): H.VNode<TodoAction> {
  let filteredTodos = todosByVisibility(todos, visibility);
  let allCompleted = todos.every(x => x.completed);
  return H.h('section.main',
    { style: { visibility: todos.length === 0 ? 'hidden' : 'visible' }
    },
    [ H.h('input.toggle-all',
        { attrs:
            { id: 'toggle-all'
            }
        , props:
            { type: 'checkbox'
            , name: 'toggle'
            , checked: allCompleted
            }
        , events:
            { input: H.onChecked(
                H.alwaysEmit<TodoAction>(
                  { tag: TodoActionType.TOGGLEALL, payload: allCompleted === false}
                ))
            }
        }
      )
    , H.h('label',
        { props: { for: 'toggle-all' } },
        'Mark all as completed'
      )
    , H.h('ul.todo-list', filteredTodos.map(renderKeyedTodo))
    ]
  );
}

function renderKeyedTodo(todo: Todo): H.VNode<TodoAction> {
  return H.lazy('li', todo, renderTodo, todo.id.toString());
}

function renderTodo(todo: Todo): H.VNode<TodoAction> {
  return H.h('li',
    { class: { completed: todo.completed, editing: todo.editing }
    },
    [ todo.editing ? renderTodoInput(todo) : renderTodoDesc(todo)
    ]
  );
}

function renderTodoInput(todo: Todo): H.VNode<TodoAction> {
  return H.h('input.edit',
    { props:
        { type: 'text'
        , value: todo.text
        }
    , events:
        { input: H.onValueInput(updateTodoHandler(todo.id))
        , blur: H.alwaysEmit<TodoAction>(
            { tag: TodoActionType.EDITINGTODO, payload: { ix: todo.id, editing: false } }
          )
        , keyup: H.onKey(selectKeyOrEscape,
            watchInput(
              { tag: TodoActionType.EDITINGTODO, payload: { ix: todo.id, editing: true } },
              { tag: TodoActionType.EDITINGTODO, payload: { ix: todo.id, editing: false } }
            )
          )
        }
    , hook:
        { insert: focusInputVnode
        }
    }
  );
}

function renderTodoDesc(todo: Todo): H.VNode<TodoAction> {
  return H.h<TodoAction>('div.view',
    [ H.h('input.toggle',
        { props: { type: 'checkbox', checked: todo.completed }
        , events:
            { change: H.onChecked(toggleHandler(todo.id))
            }
        }
      )
    , H.h('label',
        { events:
            { dblclick: H.alwaysEmit<TodoAction>(
                { tag: TodoActionType.EDITINGTODO, payload: { ix: todo.id, editing: true }}
              )
            }
        },
        todo.text
      )
    , H.h('button.destroy',
        { props: { type: 'button' }
        , events: { click: H.alwaysEmit<TodoAction>({ tag: TodoActionType.DELETETODO, payload: todo.id })}
        }
      )
    ]
  );
}

function renderControl(visibility: Visibility, todos: Todo[]): H.VNode<TodoAction> {
  const lenCompleted = todos.filter(x => x.completed).length;
  const lenLeft = todos.length - lenCompleted;
  return H.h('footer.footer',
    { attrs: { hidden: todos.length === 0 } },
    [ H.lazy('span.todo-count', lenLeft, renderCount)
    , H.lazy('ul.filters', visibility, renderFilters)
    , H.lazy('button.clear-completed', lenCompleted, renderClear)
    ]
  );
}

function renderCount(count: number): H.VNode<TodoAction> {
  let suffix = count === 1 ? ' item' : ' items';
  return H.h<TodoAction>('span.todo-count',
    [ H.h('strong', count)
    , suffix
    ]
  );
}

function renderFilters(active: Visibility): H.VNode<TodoAction> {
  return H.h('ul.filters',
    [Visibility.ALL, Visibility.ACTIVE, Visibility.COMPLETED].map(v => visibilityLink(active, v))
  );
}

function renderClear(len: number): H.VNode<TodoAction> {
  return H.h('button.clear-completed',
    { attrs: { hidden: len === 0 }
    , events:
        { click: H.alwaysEmit<TodoAction>({ tag: TodoActionType.DELETECOMPLETED })
        }
    },
    `Clear completed (${len})`
  );
}

function visibilityLink(active: Visibility, item: Visibility): H.VNode<TodoAction> {
  return H.h('li',
    H.h('a',
      { class: { active: active === item }
      , attrs: { href: '#/' + showVisibility(item) }
      , events: { click: changeVisibilityHandler(item) }
      },
      showVisibility(item)
    )
  );
}

function showVisibility(v: Visibility) {
  return v === Visibility.ALL ? 'all'
  : v === Visibility.ACTIVE   ? 'active'
  :                             'completed'
}

function infoFooter(): H.VNode<any> {
  return H.h('footer.info',
    [ H.h('p', 'Double-click to edit a todo')
    , H.h('p',
        [ 'Written by '
        , H.h('a', { attrs: { href: 'https://github.com/syaiful6' } }, 'Syaiful Bahri')
        ]
      )
    , H.h('p',
        [ 'Part of '
        , H.h('a', { attrs: { href: 'http://todomvc.com' } }, 'TodoMVC')
        ]
      )
    ]
  );
}

export function intepretWriteStorage<A>(ws: WriteStorage<A>): A {
  let stored: StoredTodos = {
    todos: ws.model.todos,
    fresh: ws.model.fresh
  };
  window.localStorage.setItem('genjer-todos', JSON.stringify(stored));
  return ws.value;
}

export function todoApp(
  stored: StoredTodos | undefined
): H.App<WriteStorage<TodoAction>, never, Todos, TodoAction> {
  const initial: Todos = {
    todos: [], fresh: 0, pending: '', visibility: Visibility.ALL
  }
  const model: Todos = stored == null
    ? initial : assign({}, initial, { todos: stored.todos, fresh: stored.fresh });
  return {
    render,
    update,
    subs: () => [],
    init: H.purely(model)
  }
}

function todosByVisibility(todos: Todo[], visibility: Visibility): Todo[] {
  return visibility === Visibility.ALL ? todos
    : visibility === Visibility.ACTIVE ? todos.filter(x => x.completed === false)
    : todos.filter(x => x.completed);
}

function modifyWhere<A>(pred: (s: A) => boolean, modify: (s: A) => A, xs: A[]): A[] {
  return xs.map(a => pred(a) ? modify(a) : a)
}

function newTodo(text: string, id: number): Todo {
  return { text, id, editing: false, completed: false };
}

function snocArr<A>(xs: A[], a: A): A[] {
  let ys = xs.slice();
  ys.push(a);
  return ys;
}

function focusInputVnode(vnode: H.VNode<any>) {
  let elm = vnode.elm;
  if (elm) {
    (elm as any).focus();
  }
}

function updatePending(ev: Event): TodoAction {
  return {
    tag: TodoActionType.UPDATEPENDING,
    payload: (ev.currentTarget as any).value
  }
}

function selectKeyOrEscape(key: string): key is 'Enter' | 'Escape' {
  return key === 'Enter' || key === 'Escape';
}

function toggleHandler(id: number) {
  return new ToggleHandler(id);
}

function updateTodoHandler(id: number) {
  return new UpdateTodoHandler(id);
}

function changeVisibilityHandler(vi: Visibility) {
  return new VisibilityHandler(vi);
}

function watchInput(
  enter: TodoAction,
  esc: TodoAction
): H.HandlerFnOrObject<'Enter' | 'Escape', TodoAction> {
  return new WatchInput(enter, esc);
}

class ToggleHandler {
  constructor(readonly id: number) {
  }

  handleEvent(completed: boolean): TodoAction {
    const ix = this.id;
    return { tag: TodoActionType.TOGGLETODO, payload: { ix, completed }}
  }
}

class UpdateTodoHandler {
  constructor(readonly ix: number) {
  }

  handleEvent(text: string): TodoAction {
    const ix = this.ix;
    return { tag: TodoActionType.UPDATETODO, payload: { ix, text } };
  }
}

class VisibilityHandler {
  constructor(readonly visibility: Visibility) {
  }

  handleEvent(ev: Event): TodoAction {
    ev.preventDefault();
    return { tag: TodoActionType.CHANGEVISIBILITY, payload: this.visibility };
  }
}

class WatchInput {
  constructor(
    readonly Enter: TodoAction,
    readonly Escape: TodoAction
  ) {
  }

  handleEvent(s: 'Enter' | 'Escape') {
    return this[s];
  }
}
