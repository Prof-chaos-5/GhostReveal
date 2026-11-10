import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Result from "./pages/Result";
import PredictText from "./pages/PredictText";
import LogViewer from "./components/LogViewer";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/result" element={<Result />} />
        <Route path="/predict-text" element={<PredictText />} />
      </Routes>
      <LogViewer />
    </BrowserRouter>
  );
}
