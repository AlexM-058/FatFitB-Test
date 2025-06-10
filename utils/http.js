import { useAuthStore } from '@stores/authStore';
import { getToken } from './jwt';
import { toast } from 'react-toastify';
import defaultToastOptions from './toast';

export const httpRequest = async (url, options = {}, undefinedContentType = false) => {
    try {
        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${getToken()}`,
        };
        if (!undefinedContentType) {
            headers['Content-Type'] = (options.headers && options.headers['Content-Type']) || 'application/json';
        }

        const response = await fetch(url, {
            ...options,
            headers
        });

        const repClone = response.clone();

        if (repClone.status === 401 || repClone.status === 403) {
            let json;
            try {
                json = await repClone.json();
            } catch (e) {
                json = {};
            }
            if (json.message === 'Token expired') {
                handleTokenExpired();
                return Promise.reject('Token has expired');
            }
        }

        return response;
    } catch (err) {
        console.error('HTTP Request failed: ', err);
        throw err;
    }
};

const handleTokenExpired = () => {
    useAuthStore.getState().logout();
    toast.error('Your session has expired. You will be redirected to the login page.');
    setTimeout(() => {
        window.location.reload();
    }, defaultToastOptions.autoClose);
};
