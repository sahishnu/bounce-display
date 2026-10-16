import { Navigate, Route, Routes } from "react-router-dom";
import { AdminPage } from "./pages/AdminPage";
import { DisplayPage } from "./pages/DisplayPage";
import { ProtoPage } from "./pages/ProtoPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<DisplayPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/proto" element={<ProtoPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
