import { RoomService, ListClient } from '@roomservice/browser';
import { useEffect, useState } from 'react';

function useList(
  roomName: string,
  listName: string
): [ListClient<any>, (l: ListClient<any>) => void] {
  const [list, setList] = useState<ListClient<any>>();

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
  const [list, setList] = useList('lists', 'todos');
  const [text, setText] = useState('');

  function onCheckOff(i: number) {
    if (!list) return;
    setList(list.delete(i));
  }

  function onEnterPress() {
    if (!list) return;
    setList(list.push(text));
    setText('');
  }

  return (
    <div className="container">
      <h2>Todos</h2>
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyPress={e => {
          if (e.key === 'Enter') {
            onEnterPress();
          }
        }}
      />
      {list &&
        list.toArray().map((l, i) => (
          <p
            className="todo"
            key={JSON.stringify(l) + '-' + i}
            onClick={() => onCheckOff(i)}
          >
            {l.object || l}
            {'-'}
            {i}
          </p>
        ))}
      <style jsx>{`
        .container {
          margin: 0 auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
        }
        input {
          padding: 24px 24px;
          border-radius: 4px;
          border: 1px solid #cfdae2;
          border-bottom: 2px solid #cfdae2;
          display: flex;
          font-size: 1em;
          outline: none;
          transition all 0.15s;
          margin-bottom: 24px;
        }
        input:focus {
          border-color: #90a6b6;
          box-shadow: 10px 10px 30px #d3d5d6, -5px -5px 15px #ffffff;
        }
        .todo {
          padding: 12px;
          margin: 0;
          border-bottom: 1px dashed #cfdae2;
        }
        .todo:hover {
          background: #f8fafc;
          border-color: #50a2dd;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
