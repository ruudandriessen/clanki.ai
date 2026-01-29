import { useState, useEffect } from "react";

function App() {
  const [health, setHealth] = useState<string>("checking...");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => setHealth(data.status))
      .catch(() => setHealth("unreachable"));
  }, []);

  return (
    <div className="app">
      <h1>Clanki</h1>
      <p>
        Worker status: <strong>{health}</strong>
      </p>
    </div>
  );
}

export default App;
