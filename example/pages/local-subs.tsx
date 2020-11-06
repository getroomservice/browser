import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import RoomService from '../../dist';

const rs = new RoomService({
  auth: '/api/hello',
});

function useRoom(): any {
  const [room, setRoom] = useState();

  useEffect(() => {
    async function load() {
      const room = await rs.room('subs-demo');
      setRoom(room as any);
    }
    load();
  }, []);

  return room;
}

function Input(props) {
  const room = useRoom();

  function onChange(e) {
    if (!room) return;
    room.map(props.mapName).set('name', e.target.value);
  }

  return <input onChange={onChange} />;
}

function ViewPort(props) {
  const [map, setMap] = useState() as any;
  const room = useRoom();
  const counts = useRef(0);

  useEffect(() => {
    if (!room) return;
    const map = room.map(props.mapName);
    setMap(map);
    room.subscribe(map, nextMap => {
      counts.current++;
      console.log(counts.current);
      setMap(nextMap);
    });
  }, [room]);

  return <div>{map && map.get('name')}</div>;
}

export default function Home() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
      }}
    >
      <div
        style={{
          width: 100,
        }}
      >
        <Input mapName="pets" />
        <hr />
        <ViewPort mapName="pets" />
      </div>
      <div
        style={{
          width: 100,
        }}
      >
        <Input mapName="cats" />
        <hr />
        <ViewPort mapName="cats" />
      </div>
      <div
        style={{
          width: 100,
        }}
      >
        <Input mapName="pets" />
        <hr />
        <ViewPort mapName="pets" />
      </div>
    </div>
  );
}
