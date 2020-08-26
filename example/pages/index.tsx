import { RoomService } from '@roomservice/browser';
import { useEffect, useState } from 'react';
import { ListClient } from '../../dist/ListClient';

function useList(room: string, name: string): [boolean, ListClient] {
  const [list, setList] = useState<ListClient>();

  useEffect(() => {
    async function load() {
      const rs = new RoomService({
        authURL: '/api/hello',
      });

      const r = await rs.room(room);
      setList(await r.list(name));
    }

    load();
  }, []);

  return [!!list, list];
}

export default function Home() {
  const [isLoaded, list] = useList('room', 'todo');
  const [text, setText] = useState('');
  const [todos, setTodos] = useState([]);

  function onClick() {
    list.push(text);
    setTodos(list.toArray());
  }

  return (
    <div>
      <pre>{todos}</pre>
      <input type="text" value={text} onChange={e => setText(e.target.value)} />
      <button onClick={onClick}>Add TODO</button>
    </div>
  );
}
