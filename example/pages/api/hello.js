// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default async (req, res) => {
  res.statusCode = 200;

  const r = await fetch('http://localhost:3453/', {
    method: 'post',
    headers: {
      Authorization: 'Bearer: KMPpb2yt-2QMh1wY19M-v',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      guest: `okay_${getRandomInt(0, 20000)}`,
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
