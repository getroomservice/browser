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

function Input(props) {
  const room = useRoom(props.roomName);

  function onChange(e) {
    if (!room) return;
    room.map(props.mapName).set('name', e.target.value);
  }

  return <input onChange={onChange} />;
}

function ViewPort(props) {
  const [state, setState] = useState({ name: '' });
  const room = useRoom(props.roomName);
  const counts = useRef(0);

  useEffect(() => {
    if (!room) return;
    const map = room.map(props.mapName);
    setState(map.toObject());
    room.subscribe(map, (json) => {
      counts.current++;
      console.log(counts.current);
      setState(json);
    });
  }, [room]);

  return <div>{state.name || ''}</div>;
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
        <Input mapName="pets" roomName="alpha" />
        <hr />
        <ViewPort mapName="pets" roomName="alpha" />
      </div>
      <div
        style={{
          width: 100,
        }}
      >
        <Input mapName="pets" roomName="alpha" />
        <hr />
        <ViewPort mapName="pets" roomName="alpha" />
      </div>
      <div
        style={{
          width: 100,
        }}
      >
        <Input mapName="cats" roomName="alpha" />
        <hr />
        <ViewPort mapName="cats" roomName="alpha" />
      </div>
      <div
        style={{
          width: 100,
        }}
      >
        <Input mapName="pets" roomName="beta" />
        <hr />
        <ViewPort mapName="pets" roomName="beta" />
      </div>
    </div>
  );
}
