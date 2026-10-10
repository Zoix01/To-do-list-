import { createContext, useContext, useState, type ReactNode } from 'react';
import type { ISODate, Task } from '../../shared/types';
import { Dialog } from './Dialog';
import { TaskForm } from './TaskForm';

export interface NewTaskDefaults {
  deadline?: ISODate;
  listId?: string | null;
}

type FormState = { key: number } & ({ task: Task } | { defaults: NewTaskDefaults });

interface TaskFormValue {
  openNew: (defaults?: NewTaskDefaults) => void;
  openEdit: (task: Task) => void;
}

const TaskFormContext = createContext<TaskFormValue | null>(null);

export function TaskFormProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FormState | null>(null);
  const [counter, setCounter] = useState(0);
  const open = (next: { task: Task } | { defaults: NewTaskDefaults }) => {
    setCounter(counter + 1);
    setState({ key: counter + 1, ...next });
  };
  const close = () => setState(null);
  const editing = state && 'task' in state ? state.task : undefined;

  return (
    <TaskFormContext.Provider
      value={{ openNew: (defaults = {}) => open({ defaults }), openEdit: (task) => open({ task }) }}
    >
      {children}
      <Dialog
        open={state !== null}
        onClose={close}
        title={editing ? 'Edit task' : 'New task'}
        hideTitle
      >
        {state && (
          <TaskForm
            key={state.key}
            task={editing}
            defaults={'defaults' in state ? state.defaults : {}}
            onClose={close}
          />
        )}
      </Dialog>
    </TaskFormContext.Provider>
  );
}

export function useTaskForm(): TaskFormValue {
  const value = useContext(TaskFormContext);
  if (!value) throw new Error('useTaskForm outside TaskFormProvider');
  return value;
}
