import { RoomService } from '@roomservice/browser';
import { useEffect, useState } from 'react';
import { ListClient } from '../../dist/ListClient';

export default function Home() {
  const [list, setList] = useState<ListClient>();

  useEffect(() => {
    async function load() {
      const rs = new RoomService({
        authURL: '/api/hello',
      });

      const r = await rs.room('room');
      const list = await r.list('todo');
      setList(list);

      r.onUpdate(list, msg => {
        setList(list.update(msg));
      });
    }

    load();
  }, []);

  const [text, setText] = useState('');

  function onClick() {
    setList(list.push(text));
  }

  return (
    <div>
      <pre>{list && list.toArray()}</pre>
      <input type="text" value={text} onChange={e => setText(e.target.value)} />
      <button onClick={onClick}>Add TODO</button>
    </div>
  );
}
