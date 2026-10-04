export type Priority = 'low' | 'medium' | 'high';
export type NoteColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple' | 'white';

export interface Note {
  id: string;
  title: string;
  content: string;
  color: NoteColor;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
}

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  priority: Priority;
  dueDate?: string;
  createdAt: Date;
}

export interface TodoList {
  id: string;
  title: string;
  items: TodoItem[];
  createdAt: Date;
}
