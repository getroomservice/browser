// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default async (req, res) => {
  res.statusCode = 200;

  const API_KEY = 'nEK9OXZsk5G0gdEGieqwy';
  const user = 'some-user-' + getRandomInt(1, 200);

  const r = await fetch('https://super.roomservice.dev/provision', {
    method: 'post',
    headers: {
      Authorization: `Bearer: ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user: user,
      resources: [
        {
          reference: 'room',
          object: 'room',
          permission: 'join',
        },
        {
          reference: 'default',
          object: 'document',
          permission: 'read_write',
          room: 'room',
        },
      ],
    }),
  });

  const json = await r.json();
  console.log(json);

  res.json(json);
};
