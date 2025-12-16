// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

export default async function handler(req, res) {
  const data = req.body
  const response = await fetch(`http://127.0.0.1:5001/chat-24ce7/us-central1/addmessage?key=${data.key}&index=${data.index}&uid=${data.uid}`)
  console.log(`http://127.0.0.1:5001/chat-24ce7/us-central1/addmessage?key=${data.key}&index=${data.index}&uid=${data.uid}`)
  res.status(200).json(await response.json())

}
