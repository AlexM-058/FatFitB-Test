import { toast } from "react-toastify";
import { httpRequest } from "./http";
import { getUser, removeToken, setToken } from "./jwt";
import { useAuthStore } from "@stores/authStore";

export default class AuthService {
	// API URL
	url = ""; // initialize url as an empty string (or you can omit this line in JS, it's not required)

	constructor() {
		this.url = import.meta.env.VITE_API_URL;
	}

	/**
	 * Login user
	 * @param {string} username
	 * @param {string} password
	 * @returns {Promise<boolean>}
	 */
	async login(username, password) {
		try {
			const response = await httpRequest(this.url + "login", {
				method: "POST",
				body: JSON.stringify({ username, password }),
			});

			const json = await response.json();

			if (!response.ok) {
				throw new Error(json.message || json.error || "An error occurred. Please try again later.");
			}

			// If backend returns token in response, set it in cookies/localStorage
			if (json.token) {
				setToken(json.token);
			}

			toast.success("Login successful");

			const user = getUser();

			if (user) {
				useAuthStore.getState().setUser(user);
			}

			return true;
		} catch (error) {
			toast.error(error && error.message ? error.message : "An error occurred. Please try again later.");
			return false;
		}
	}

	/**
	 * Logout user
	 */
	logout() {
		removeToken();
		useAuthStore.getState().logout();
	}
}
