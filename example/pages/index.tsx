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

      const room = await rs.room('wefae');
      const list = await room.list('todo');
      setList(list);

      room.onUpdate(list, msg => {
        setList(msg);
      });
    }

    load().catch(console.error);
  }, []);

  const [text, setText] = useState('');

  function onClick() {
    setList(list.push(text));
  }

  return (
    <div>
      <input type="text" value={text} onChange={e => setText(e.target.value)} />
      <button onClick={onClick}>Add TODO</button>
      {((list && list.toArray().reverse()) || []).map(s => {
        return <p>{s}</p>;
      })}
    </div>
  );
}
