import { RoomService } from '@roomservice/browser';
import { useEffect, useState } from 'react';
import { ListClient } from '../../dist/ListClient';

function useList(
  roomName: string,
  listName: string
): [ListClient, (l: ListClient) => void] {
  const [list, setList] = useState<ListClient>();

  useEffect(() => {
    async function load() {
      const client = new RoomService({
        auth: '/api/hello',
      });
      const room = await client.room(roomName);
      const l = await room.list(listName);
      setList(l);

      room.subscribe(l, li => {
        setList(li);
      });
    }
    load();
  }, []);

  return [list, setList];
}

export default function List() {
  const [list, setList] = useList('coolio', 'todos');

  function onClick() {
    if (!list) return;
    setList(list.push('new thing'));
  }

  return (
    <div>
      {JSON.stringify(list && list.toArray())}{' '}
      <button onClick={onClick}>Add thing</button>
    </div>
  );
}
