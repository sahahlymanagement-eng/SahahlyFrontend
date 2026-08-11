import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:6001/api"
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Let the browser set multipart boundary — a manual Content-Type breaks file uploads.
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    if (config.headers && typeof config.headers.delete === "function") {
      config.headers.delete("Content-Type");
    } else if (config.headers) {
      delete config.headers["Content-Type"];
      delete config.headers["content-type"];
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      error.isSessionExpired = true;
      const serverMsg = error.response?.data?.message || error.response?.data?.error;
      error.sessionMessage =
        serverMsg && !/invalid or expired token/i.test(serverMsg)
          ? serverMsg
          : "Your session has expired. Please sign in again.";
    }
    return Promise.reject(error);
  }
);

export default api;
    