import React, { useState, useEffect } from "react";
import { makeStyles } from "@material-ui/core/styles";
import axios from "axios";

import ModalImage from "react-modal-image";
import api from "../../services/api";

const useStyles = makeStyles(theme => ({
	messageMedia: {
		objectFit: "cover",
		width: 250,
		height: "auto", // Redimensionar automaticamente a altura para manter a proporção
		borderTopLeftRadius: 8,
		borderTopRightRadius: 8,
		borderBottomLeftRadius: 8,
		borderBottomRightRadius: 8,
	}
}));

const ModalImageCors = ({ imageUrl }) => {
	const classes = useStyles();
	const [fetching, setFetching] = useState(true);
	const [blobUrl, setBlobUrl] = useState("");

	useEffect(() => {
		if (!imageUrl) return;
		const fetchImage = async () => {
			const maxRetries = 3;
			let retryCount = 0;
			
			const tryFetch = async () => {
				try {
					// Verificar se é uma URL completa ou relativa
					let apiUrl = imageUrl;
					
					// Se for URL completa (inclui protocolo), extrair apenas a parte da rota
					if (imageUrl.startsWith('http')) {
						const urlObj = new URL(imageUrl);
						apiUrl = urlObj.pathname; // Pega apenas o path, ex: /media/1/filename.jpg
					}
					
					console.log("Carregando imagem via API:", apiUrl);
					
					const response = await api.get(apiUrl, {
						responseType: "blob",
					});
					
					const blobUrl = window.URL.createObjectURL(
						new Blob([response.data], { type: response.headers["content-type"] })
					);
					setBlobUrl(blobUrl);
					setFetching(false);
				} catch (error) {
					console.error("Erro ao carregar imagem:", error);
					
					// Se for erro de autenticação, não tentar fallback
					if (error?.response?.status === 401 || error?.response?.status === 403) {
						console.error("Erro de autenticação ao carregar imagem");
						setFetching(false);
						return;
					}
					
					// Retry para outros erros
					if (retryCount < maxRetries) {
						retryCount++;
						console.log(`Tentativa ${retryCount} de ${maxRetries} para carregar imagem`);
						setTimeout(() => tryFetch(), 1000 * retryCount);
						return;
					}
					
					// Fallback: para mensagens antigas com URLs públicas
					if (imageUrl.includes('/public/')) {
						try {
							const response = await axios.get(imageUrl, {
								responseType: "blob",
							});
							const blobUrl = window.URL.createObjectURL(
								new Blob([response.data], { type: response.headers["content-type"] })
							);
							setBlobUrl(blobUrl);
							setFetching(false);
						} catch (fallbackError) {
							console.error("Fallback também falhou:", fallbackError);
							setBlobUrl(imageUrl);
							setFetching(false);
						}
					} else {
						setBlobUrl(imageUrl);
						setFetching(false);
					}
				}
			};
			
			tryFetch();
		};
		fetchImage();
	}, [imageUrl]);

	return (
		<ModalImage
			className={classes.messageMedia}
			smallSrcSet={fetching ? imageUrl : blobUrl}
			medium={fetching ? imageUrl : blobUrl}
			large={fetching ? imageUrl : blobUrl}
			alt="image"
			showRotate={true}
		/>
	);
};

export default ModalImageCors;
