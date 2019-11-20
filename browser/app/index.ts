import * as H from './genjer';
import {StoredTodos, intepretWriteStorage, todoApp} from './todos';

function getStoredModel(key: string): StoredTodos {
  const ss = window.localStorage.getItem(key);
  return ss !== null ? JSON.parse(ss) : void 0
}

function main() {
  const stored = getStoredModel('genjer-todos');
  const appInstance = H.make(
    H.mergeInterpreter(H.stepper(intepretWriteStorage), H.interpretNever()),
    todoApp(stored),
    document.querySelector('.app') as Element
  );
  appInstance.run();
}
requestAnimationFrame(main);
