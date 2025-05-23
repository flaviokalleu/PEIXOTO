import React, { useRef, useEffect, useState } from "react";
import { 
  Box, 
  IconButton, 
  Slider, 
  Typography, 
  Paper,
  Menu,
  MenuItem,
  CircularProgress,
  Tooltip,
  useMediaQuery,
  useTheme
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import { 
  Play, 
  Pause,
  MoreVertical,
  Download,
  Share2
} from "lucide-react";

// Definição dos estilos com makeStyles
const useStyles = makeStyles((theme) => ({
  root: {
    width: '100%',
    minWidth: 250,
    borderRadius: 8,
    padding: theme.spacing(1.5, 2),
    backgroundColor: theme.palette.type === 'dark' ? '#262d31' : '#f0f2f5',
    marginBottom: theme.spacing(1),
    display: 'flex',
    alignItems: 'center',
    [theme.breakpoints.up('sm')]: {
      width: '100%',
      minWidth: 350,
    },
    [theme.breakpoints.up('md')]: {
      width: '100%',
      minWidth: 450,
    }
  },
  playerContainer: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    height: 60,
  },
  playButtonContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 48,
    marginRight: theme.spacing(1.5),
  },
  playButton: {
    backgroundColor: theme.palette.type === 'dark' ? '#00a884' : '#00a884',
    color: '#fff',
    padding: 8,
    '&:hover': {
      backgroundColor: theme.palette.type === 'dark' ? '#008c70' : '#008c70',
    },
    boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
  },
  contentContainer: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    marginRight: theme.spacing(1),
    minWidth: 0, // Importante para evitar overflow
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
  },
  timeDisplay: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    minWidth: 45,
    textAlign: 'right',
    marginLeft: theme.spacing(1),
    fontWeight: 'medium',
    fontFamily: 'Roboto Mono, monospace',
  },
  slider: {
    color: theme.palette.type === 'dark' ? '#00a884' : '#00a884',
    height: 4,
    padding: '13px 0',
    '& .MuiSlider-thumb': {
      width: 12,
      height: 12,
      marginTop: -4,
      marginLeft: -6,
      '&:hover, &.Mui-focusVisible': {
        boxShadow: '0px 0px 0px 8px rgba(0, 168, 132, 0.16)',
      },
    },
    '& .MuiSlider-rail': {
      opacity: 0.3,
    },
  },
  speedDisplay: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    minWidth: 50,
  },
  speedText: {
    fontSize: '0.75rem',
    fontWeight: 'bold',
    color: theme.palette.type === 'dark' ? '#8696a0' : '#667781',
    marginRight: -4,
    padding: '2px 4px',
    borderRadius: 4,
    backgroundColor: theme.palette.type === 'dark' ? 'rgba(134, 150, 160, 0.15)' : 'rgba(102, 119, 129, 0.15)',
  },
  waveform: {
    display: 'flex',
    alignItems: 'center',
    height: 24,
    width: '100%',
    marginBottom: 6,
  },
  waveformBar: {
    flex: 1,
    height: '30%',
    backgroundColor: theme.palette.type === 'dark' ? '#8696a0' : '#667781',
    marginRight: 2,
    opacity: 0.3,
    borderRadius: 1,
    transition: 'height 0.2s ease-in-out',
    '&:nth-child(odd)': {
      height: '60%',
    },
    '&:nth-child(3n)': {
      height: '90%',
    },
    '&:nth-child(5n)': {
      height: '40%',
    },
    '&:nth-child(7n)': {
      height: '70%',
    },
  },
  waveformBarActive: {
    backgroundColor: theme.palette.type === 'dark' ? '#00a884' : '#00a884',
    opacity: 0.7,
  },
  waveformAnimated: {
    animation: '$pulse 1.5s infinite ease-in-out',
  },
  '@keyframes pulse': {
    '0%': {
      height: '30%',
    },
    '50%': {
      height: '70%',
    },
    '100%': {
      height: '30%',
    },
  },
  rightControls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginLeft: theme.spacing(1),
    minWidth: 80,
  },
  actionButton: {
    padding: 6,
    color: theme.palette.type === 'dark' ? '#8696a0' : '#667781',
  },
  lucideIcon: {
    width: 20,
    height: 20,
  },
  moreButton: {
    padding: 6,
  },
  loading: {
    color: theme.palette.type === 'dark' ? '#00a884' : '#00a884',
  },
  durationBadge: {
    fontSize: '0.7rem',
    color: theme.palette.type === 'dark' ? '#8696a0' : '#667781',
    padding: '2px 6px',
    borderRadius: 10,
    backgroundColor: theme.palette.type === 'dark' ? 'rgba(134, 150, 160, 0.15)' : 'rgba(102, 119, 129, 0.15)',
    position: 'absolute',
    top: -8,
    left: 0,
    fontWeight: 'medium',
    whiteSpace: 'nowrap',
  },
  waveformContainer: {
    position: 'relative',
    width: '100%',
  },
  tooltipPlacementTop: {
    margin: '0',
  }
}));

const LS_NAME = 'audioMessageRate';

// Número de barras para o waveform simulado - ajustável de acordo com o tamanho da tela
const getWaveformBars = (width) => {
  if (width < 600) return 24;
  if (width < 960) return 32;
  return 40;
};

const AudioPlayer = ({ url, onDownload, onShare }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('xs'));
  const isTablet = useMediaQuery(theme.breakpoints.down('sm'));
  const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const WAVEFORM_BARS = getWaveformBars(windowWidth);
  
  const classes = useStyles();
  
  const audioRef = useRef(null);
  const [audioRate, setAudioRate] = useState(parseFloat(localStorage.getItem(LS_NAME) || "1"));
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [anchorEl, setAnchorEl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFailed, setIsLoadingFailed] = useState(false);
  
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  // Formatar tempo em minutos:segundos
  const formatTime = (time) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Formatar tempo restante
  const formatTimeRemaining = () => {
    const remaining = duration - currentTime;
    return `-${formatTime(remaining)}`;
  };

  // Atualizar taxa de reprodução
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = audioRate;
      localStorage.setItem(LS_NAME, audioRate);
    }
  }, [audioRate]);

  // Configurar os event listeners do áudio
  useEffect(() => {
    const audio = audioRef.current;
    
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      setProgress((audio.currentTime / audio.duration) * 100);
    };
    
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };
    
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };
    
    const handleLoadError = () => {
      setIsLoading(false);
      setIsLoadingFailed(true);
    };
    
    const handleCanPlayThrough = () => {
      setIsLoading(false);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleLoadError);
    audio.addEventListener("canplaythrough", handleCanPlayThrough);
    
    // Timeout para indicar se o áudio está demorando muito para carregar
    const loadingTimeout = setTimeout(() => {
      if (isLoading && !audio.duration) {
        // Tentar novamente carregando o áudio
        audio.load();
      }
    }, 5000);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleLoadError);
      audio.removeEventListener("canplaythrough", handleCanPlayThrough);
      clearTimeout(loadingTimeout);
    };
  }, [isLoading]);

  // Gerenciar a reprodução do áudio
  const togglePlay = () => {
    if (isLoadingFailed) {
      // Se houve falha no carregamento, tenta recarregar o áudio
      audioRef.current.load();
      setIsLoading(true);
      setIsLoadingFailed(false);
      return;
    }
    
    if (isLoading) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            // Reprodução iniciada com sucesso
          })
          .catch((error) => {
            // Auto-play impedido pelo navegador
            console.error("Erro ao reproduzir áudio:", error);
          });
      }
    }
  };

  // Controlar a posição do áudio
  const handleProgressChange = (_, newValue) => {
    if (isLoading) return;
    
    const seekTime = (newValue / 100) * duration;
    audioRef.current.currentTime = seekTime;
    setProgress(newValue);
    setCurrentTime(seekTime);
  };

  // Abrir menu de velocidade
  const handleMenuClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  // Fechar menu de velocidade
  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  // Alterar a velocidade de reprodução
  const changeRate = (rate) => {
    setAudioRate(parseFloat(rate));
    handleMenuClose();
  };
  
  // Manipular download
  const handleDownload = () => {
    if (onDownload && typeof onDownload === 'function') {
      onDownload(url);
    } else {
      // Download padrão se não houver callback específico
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audio-' + new Date().getTime() + (isIOS ? '.mp3' : '.ogg');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };
  
  // Manipular compartilhamento
  const handleShare = () => {
    if (onShare && typeof onShare === 'function') {
      onShare(url);
    } else if (navigator.share) {
      navigator.share({
        title: 'Compartilhar áudio',
        url: url
      }).catch(console.error);
    }
  };

  // Renderizar as barras do waveform simulado
  const renderWaveform = () => {
    const bars = [];
    const progressIndex = Math.floor((progress / 100) * WAVEFORM_BARS);
    
    for (let i = 0; i < WAVEFORM_BARS; i++) {
      const barClass = `${classes.waveformBar} ${
        isPlaying && i > progressIndex ? classes.waveformAnimated : ''
      } ${i <= progressIndex ? classes.waveformBarActive : ''}`;
      
      bars.push(<div key={i} className={barClass} />);
    }
    
    return bars;
  };

  // Obter a fonte do áudio baseado no dispositivo
  const getAudioSource = () => {
    let sourceUrl = url;

    if (isIOS) {
      sourceUrl = sourceUrl.replace(".ogg", ".mp3");
    }

    return (
      <source src={sourceUrl} type={isIOS ? "audio/mp3" : "audio/ogg"} />
    );
  };

  return (
    <Paper className={classes.root} elevation={1}>
      {/* Áudio nativo (escondido) */}
      <audio ref={audioRef}>
        {getAudioSource()}
      </audio>
      
      {/* Interface similar ao WhatsApp mas com tamanho fixo */}
      <Box className={classes.playerContainer}>
        <Box className={classes.playButtonContainer}>
          {isLoading ? (
            <CircularProgress size={32} className={classes.loading} />
          ) : (
            <IconButton 
              className={classes.playButton}
              onClick={togglePlay}
              size="small"
              aria-label={isPlaying ? "Pausar" : "Reproduzir"}
              disabled={isLoadingFailed}
            >
              {isPlaying ? (
                <Pause className={classes.lucideIcon} />
              ) : (
                <Play className={classes.lucideIcon} style={{ marginLeft: 2 }} />
              )}
            </IconButton>
          )}
        </Box>
        
        <Box className={classes.contentContainer}>
          {/* Ondas sonoras simuladas (waveform) com indicador de duração */}
          <Box className={classes.waveformContainer}>
            {duration > 0 && (
              <Typography className={classes.durationBadge}>
                {formatTime(duration)}
              </Typography>
            )}
            <Box className={classes.waveform}>
              {renderWaveform()}
            </Box>
          </Box>
          
          <Box className={classes.progressContainer}>
            <Slider
              className={classes.slider}
              value={progress}
              onChange={handleProgressChange}
              aria-labelledby="audio-progress-slider"
              min={0}
              max={100}
              disabled={isLoading || isLoadingFailed}
              aria-valuetext={`${Math.round(progress)}%`}
              title={`Progresso: ${Math.round(progress)}%`}
            />
            <Typography variant="caption" className={classes.timeDisplay}>
              {duration > 0 ? formatTimeRemaining() : "--:--"}
            </Typography>
          </Box>
        </Box>
        
        <Box className={classes.rightControls}>
          {audioRate !== 1 && (
            <Tooltip title="Velocidade de reprodução" placement="top" classes={{ tooltipPlacementTop: classes.tooltipPlacementTop }}>
              <Typography className={classes.speedText}>
                {audioRate}x
              </Typography>
            </Tooltip>
          )}
          
          {/* Botões de ação (ícones) */}
          {!isMobile && !isTablet && (
            <>
              <Tooltip title="Baixar áudio" placement="top">
                <IconButton 
                  className={classes.actionButton}
                  onClick={handleDownload}
                  size="small"
                >
                  <Download style={{ width: 16, height: 16 }} />
                </IconButton>
              </Tooltip>
              
              {navigator.share && (
                <Tooltip title="Compartilhar" placement="top">
                  <IconButton 
                    className={classes.actionButton}
                    onClick={handleShare}
                    size="small"
                  >
                    <Share2 style={{ width: 16, height: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
            </>
          )}
          
          <Tooltip title="Opções" placement="top">
            <IconButton 
              className={classes.moreButton}
              aria-controls="speed-menu" 
              aria-haspopup="true"
              onClick={handleMenuClick}
              size="small"
            >
              <MoreVertical style={{ width: 16, height: 16 }} />
            </IconButton>
          </Tooltip>
          
          <Menu
            id="speed-menu"
            anchorEl={anchorEl}
            keepMounted
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
          >
            <MenuItem disabled style={{ fontSize: '0.85rem', opacity: 0.7 }}>
              Velocidade
            </MenuItem>
            {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
              <MenuItem 
                key={rate}
                selected={audioRate === rate}
                onClick={() => changeRate(rate)}
                dense
              >
                {rate}x {rate === 1 && "(Normal)"}
              </MenuItem>
            ))}
            <MenuItem divider />
            <MenuItem onClick={handleDownload} dense>
              <Download style={{ width: 16, height: 16, marginRight: 8 }} />
              Baixar áudio
            </MenuItem>
            {navigator.share && (
              <MenuItem onClick={handleShare} dense>
                <Share2 style={{ width: 16, height: 16, marginRight: 8 }} />
                Compartilhar
              </MenuItem>
            )}
          </Menu>
        </Box>
      </Box>
    </Paper>
  );
};

export default AudioPlayer;