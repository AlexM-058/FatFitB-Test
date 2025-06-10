import Cookies from "js-cookie";
import { jwtDecode } from "jwt-decode";

const jwtFields = [
	["exp", "number"],
	["iat", "number"],
	["iss", "string"],
	["username", "string"],
	["id", "number"],
	["rights", "number"],
];

/**
 * Set the token in the cookies after login
 * @param {string} token
 */
export const setToken = (token) => {
	Cookies.set("token", token, {
		expires: 1,
		secure: false, // set to true if your website is served over HTTPS
		sameSite: "strict",
	});
};

/**
 * Get the token from the cookies for authenticated requests
 * @returns {string} token
 */
export const getToken = () => {
	return Cookies.get("token") || "";
};

/**
 * Remove the token from the cookies on logout or token expiration
 */
export const removeToken = () => {
	Cookies.remove("token");
	// DO NOT call window.location.reload() here to avoid infinite loops in React!
	// Let the app handle redirect or state update after logout.
};

/**
 * Check if the token is valid (not expired and has required fields)
 * @returns {boolean}
 */
export const isTokenValid = () => {
	try {
		const decoded = jwtDecode(getToken());
		for (const [field, type] of jwtFields) {
			if (typeof decoded[field] !== type) {
				return false;
			}
		}
		if (decoded.exp * 1000 < Date.now()) {
			removeToken();
			return false;
		}
		return true;
	} catch (err) {
		return false;
	}
};

/**
 * Get the user object from the token
 * @returns {object|null}
 */
export const getUser = () => {
	try {
		const token = getToken();
		if (token === "") {
			removeToken();
			return null;
		}
		const decodedToken = jwtDecode(token);
		return {
			id: decodedToken.id,
			username: decodedToken.username,
			rights: decodedToken.rights
		};
	} catch (error) {
		console.error(new Error(error && error.message ? error.message : "An error occurred while getting the user."));
		return null;
	}
};
