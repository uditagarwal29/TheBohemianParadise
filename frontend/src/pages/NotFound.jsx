import { Link } from "react-router-dom";
import { Empty } from "../components/ui";

export default function NotFound() {
  return (
    <Empty title="Page not found">
      <Link className="btn btn--ghost" to="/">Back home</Link>
    </Empty>
  );
}
