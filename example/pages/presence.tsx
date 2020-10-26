import { useEffect, useRef, useState } from 'react';
import RoomService from '../../dist';

const useInterval = (callback, delay) => {
  const savedCallback = useRef() as any;

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    function tick() {
      savedCallback.current();
    }
    if (delay !== null) {
      let id = setInterval(tick, delay);
      return () => clearInterval(id);
    }
  }, [delay]);
};

const rs = new RoomService({
  auth: '/api/hello',
});

export default function Presence() {
  const [room, setRoom] = useState();
  const [first, setFirst] = useState<any>({});
  const [second, setSecond] = useState<any>({});

  useEffect(() => {
    async function load() {
      const room = await rs.room('presence-demo');
      const p = room.presence();
      setRoom(room as any);

      room.subscribe(p, 'first', val => {
        setFirst(val);
      });

      room.subscribe(p, 'second', val => {
        setSecond(val);
      });
    }
    load();
  }, []);

  useInterval(() => {
    if (room === undefined) return;
    // @ts-ignore
    room!.presence().set('first', new Date().toTimeString());
    // @ts-ignore
    room!.presence().set('second', new Date().toTimeString());
  }, 1000);

  return (
    <div>
      hai
      <p>{JSON.stringify(first)}</p>
      <p>{JSON.stringify(second)}</p>
    </div>
  );
}
