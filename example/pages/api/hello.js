// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default async (req, res) => {
  const body = JSON.parse(req.body);
  const API_KEY = '-4_Cyf4ouI7p9lCW_Tlii';
  const user = 'some-user-' + getRandomInt(1, 200);

  const r = await fetch('https://super.stagingmcstagingface.com/provision', {
    method: 'post',
    headers: {
      Authorization: `Bearer: ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user: user,
      resources: body.resources,
    }),
  });

  const json = await r.json();

  console.log(json);

  res.json(json);
};
