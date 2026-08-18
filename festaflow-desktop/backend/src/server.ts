import "dotenv/config";
import { app } from "./app";

const port = Number(process.env.PORT || 3333);

app.listen(port, () => {
  console.log(`FestaFlow API running at http://localhost:${port}`);
});
