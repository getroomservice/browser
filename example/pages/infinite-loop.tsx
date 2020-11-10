import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import RoomService from '../../dist';

const rs = new RoomService({
  auth: '/api/hello',
});

function useRoom(name: string): any {
  const [room, setRoom] = useState();

  useEffect(() => {
    async function load() {
      const room = await rs.room(name);
      setRoom(room as any);
    }
    load();
  }, []);

  return room;
}

export default function Home() {
  const room = useRoom('loopin');

  function onChange(e) {
    if (!room) return;
    const map = room.map('loop');
    room.subscribe(map, m => {
      console.log('what');
      m.set('name', e.target.value);
    });
    map.set('name', e.target.value);
  }

  return <input onChange={onChange} />;
}
