import {Task} from '@jonggrang/task';

type Tuple<A, B> = [A, B];

export interface Conn {
  send(command: string, ...args: any[]): Task<any>;

  write(command: string, ...args: any[]): void;

  // exec the pipeline
  exec(): Task<Tuple<Error | null, any>[]>;
}
