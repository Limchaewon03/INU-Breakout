"use client";

import React, { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { Play, Pause, RotateCcw, LogOut, Volume2, VolumeX, X, User, Trophy, Clock } from "lucide-react";

const COLOR_PALETTE = {
  lightRed: { bg: "#fca5a5", border: "#f87171", isTarget: true },
  lightOrange: { bg: "#fed7aa", border: "#fdba74", isTarget: false },
  lightYellow: { bg: "#fef08a", border: "#fde047", isTarget: false },
  lightBlue: { bg: "#bae6fd", border: "#7dd3fc", isTarget: false },
  lightGreen: { bg: "#bbf7d0", border: "#86efac", isTarget: false },
  lightPurple: { bg: "#e9d5ff", border: "#d8b4fe", isTarget: false },
};

const NON_TARGET_KEYS = ["lightOrange", "lightYellow", "lightBlue", "lightGreen", "lightPurple"];

const GOOGLE_SHEET_URL =
  process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL ||
  process.env.NEXT_PUBLIC_GOOGLE_SHEET_URL ||
  "https://script.google.com/macros/s/AKfycbwV88XdpcsuFxqj_N9xsZPr1dLid2tNVIW-SaITji4AGiJpN1AnAtC72xQz08eA1xIc/exec";

export default function BrickBreakerGame() {
  const [screen, setScreen] = useState("intro");
  const [playerName, setPlayerName] = useState("횃불이");

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [redTargetLeft, setRedTargetLeft] = useState(3);
  const [isPaused, setIsPaused] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [gameResult, setGameResult] = useState(null);

  const [thumbsUpUntil, setThumbsUpUntil] = useState(0);

  const [isMuted, setIsMuted] = useState(false);
  const bgmRef = useRef(null);

  const [topRankings, setTopRankings] = useState([
    { name: "인천대횃불이", finishtime: "00:42" },
    { name: "송도갈매기", finishtime: "00:55" },
    { name: "학산도서관", finishtime: "01:08" },
  ]);

  const canvasRef = useRef(null);
  const animationFrameId = useRef(null);
  const timerIntervalRef = useRef(null);

  const CANVAS_WIDTH = 500;
  const CANVAS_HEIGHT = 650;

  const gameStateRef = useRef({
    paddle: { x: 195, y: 580, width: 110, height: 16, speed: 8 },
    ball: { x: 250, y: 560, radius: 8, dx: 0, dy: 0, speed: 6, inMotion: false },
    bricks: [],
    keys: { left: false, right: false },
    audioCtx: null,
    thumbsUpEndTime: 0,
  });

  useEffect(() => {
    const checker = setInterval(() => {
      if (gameStateRef.current.thumbsUpEndTime > 0 && Date.now() > gameStateRef.current.thumbsUpEndTime) {
        gameStateRef.current.thumbsUpEndTime = 0;
        setThumbsUpUntil(0);
      }
    }, 100);
    return () => clearInterval(checker);
  }, []);

  const fetchTopRankings = async () => {
    try {
      if (!GOOGLE_SHEET_URL) return;
      const res = await fetch(`${GOOGLE_SHEET_URL}?action=top3`);
      const result = await res.json();
      if (result.status === "success" && result.data && result.data.length > 0) {
        const parseSecs = (str) => {
          if (!str) return 999999;
          const parts = String(str).trim().split(":");
          if (parts.length === 2) {
            return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
          }
          return parseInt(str, 10) || 999999;
        };

        const cleaned = result.data.map((item) => {
          let timeDisplay = String(item.finishtime || "").trim();
          let seconds = 999999;

          if (timeDisplay.includes("T")) {
            try {
              const d = new Date(timeDisplay);
              const m = d.getMinutes();
              const s = d.getSeconds();
              seconds = m * 60 + s;
              timeDisplay = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
            } catch (err) {}
          } else {
            seconds = parseSecs(timeDisplay);
          }

          return {
            ...item,
            finishtime: timeDisplay || "00:00",
            seconds: seconds,
          };
        });

        // finishtime이 적을수록(가장 빠른 기록) 순위가 높도록 오름차순 정렬 후 Top 3 선정
        const sortedTop3 = cleaned
          .sort((a, b) => a.seconds - b.seconds)
          .slice(0, 3);

        setTopRankings(sortedTop3);
      }
    } catch (e) {
      console.warn("구글 시트 랭킹 조회 실패 (기존 데이터 유지):", e);
    }
  };

  useEffect(() => {
    fetchTopRankings();
  }, []);

  const playSoundEffect = (freq = 440, type = "sine", duration = 0.08) => {
    if (isMuted) return;
    try {
      if (!gameStateRef.current.audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        gameStateRef.current.audioCtx = new AudioCtx();
      }
      const ctx = gameStateRef.current.audioCtx;
      if (ctx.state === "suspended") ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  };

  const formatTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const createBricks = () => {
    const rows = 5;
    const cols = 8;
    const total = rows * cols;
    const targetRedCount = Math.round(total * 0.3);

    let types = Array(targetRedCount).fill("lightRed");
    for (let i = targetRedCount; i < total; i++) {
      const randomColor = NON_TARGET_KEYS[Math.floor(Math.random() * NON_TARGET_KEYS.length)];
      types.push(randomColor);
    }
    types.sort(() => Math.random() - 0.5);

    const bricks = [];
    const brickWidth = 52;
    const brickHeight = 22;
    const padding = 6;
    const offsetTop = 45;
    const offsetLeft = 20;

    let index = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const colorKey = types[index];
        bricks.push({
          x: c * (brickWidth + padding) + offsetLeft,
          y: r * (brickHeight + padding) + offsetTop,
          width: brickWidth,
          height: brickHeight,
          status: 1,
          colorKey: colorKey,
          isTarget: colorKey === "lightRed",
        });
        index++;
      }
    }
    return bricks;
  };

  const handleStartGame = () => {
    if (!playerName.trim()) {
      alert("사용자 이름을 입력해주세요!");
      return;
    }

    setScreen("playing");
    setLives(3);
    setScore(0);
    setRedTargetLeft(3);
    setElapsedTime(0);
    setGameResult(null);
    setIsPaused(false);
    gameStateRef.current.thumbsUpEndTime = 0;
    setThumbsUpUntil(0);

    if (bgmRef.current) {
      bgmRef.current.volume = 0.25;
      bgmRef.current.currentTime = 0;
      bgmRef.current.play().catch(() => {});
    }

    gameStateRef.current.paddle.x = (CANVAS_WIDTH - gameStateRef.current.paddle.width) / 2;
    gameStateRef.current.ball = { x: CANVAS_WIDTH / 2, y: 560, radius: 8, dx: 0, dy: 0, speed: 6, inMotion: false };
    gameStateRef.current.bricks = createBricks();

    startCountdown();
  };

  const startCountdown = () => {
    setCountdown(3);
    playSoundEffect(440, "sine", 0.1);

    let count = 3;
    const timer = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
        playSoundEffect(440, "sine", 0.1);
      } else if (count === 0) {
        setCountdown("GO!");
        playSoundEffect(880, "triangle", 0.2);
      } else {
        clearInterval(timer);
        setCountdown(null);
        launchBall();
        startTimer();
      }
    }, 900);
  };

  const launchBall = () => {
    const angle = Math.PI / 4 + Math.random() * (Math.PI / 2);
    const speed = gameStateRef.current.ball.speed;
    gameStateRef.current.ball.dx = speed * Math.cos(angle);
    gameStateRef.current.ball.dy = -speed * Math.sin(angle);
    gameStateRef.current.ball.inMotion = true;
  };

  const startTimer = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const togglePause = () => {
    if (gameResult || countdown !== null) return;
    if (isPaused) {
      setIsPaused(false);
      startTimer();
      if (bgmRef.current && !isMuted) bgmRef.current.play().catch(() => {});
    } else {
      setIsPaused(true);
      stopTimer();
      if (bgmRef.current) bgmRef.current.pause();
    }
  };

  const handleResetToNameScreen = () => {
    stopTimer();
    if (bgmRef.current) {
      bgmRef.current.pause();
      bgmRef.current.currentTime = 0;
    }
    setScreen("intro");
    setGameResult(null);
    setIsPaused(false);
    setCountdown(null);
    gameStateRef.current.thumbsUpEndTime = 0;
    setThumbsUpUntil(0);
    fetchTopRankings();
  };

  const handleExitGame = () => {
    if (confirm("게임을 종료하고 첫 화면으로 이동하시겠습니까?")) {
      handleResetToNameScreen();
    }
  };

  const triggerThumbsUpEffect = () => {
    const now = Date.now();
    const endTime = now + 1000;
    gameStateRef.current.thumbsUpEndTime = endTime;
    setThumbsUpUntil(endTime);

    setTimeout(() => {
      if (Date.now() >= gameStateRef.current.thumbsUpEndTime) {
        gameStateRef.current.thumbsUpEndTime = 0;
        setThumbsUpUntil(0);
      }
    }, 1050);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "ArrowLeft") {
        gameStateRef.current.keys.left = true;
      } else if (e.key === "ArrowRight") {
        gameStateRef.current.keys.right = true;
      } else if (e.key === "p" || e.key === "P") {
        togglePause();
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === "ArrowLeft") {
        gameStateRef.current.keys.left = false;
      } else if (e.key === "ArrowRight") {
        gameStateRef.current.keys.right = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isPaused, gameResult, countdown]);

  const updatePaddlePositionByClientX = (clientX) => {
    if (isPaused || gameResult) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const touchXInsideCanvas = clientX - rect.left;
    const scale = CANVAS_WIDTH / rect.width;
    const canvasX = touchXInsideCanvas * scale;

    const paddle = gameStateRef.current.paddle;
    let targetX = canvasX - paddle.width / 2;

    if (targetX < 0) targetX = 0;
    if (targetX + paddle.width > CANVAS_WIDTH) targetX = CANVAS_WIDTH - paddle.width;

    paddle.x = targetX;
  };

  const handleTouchMove = (e) => {
    if (e.touches && e.touches.length > 0) {
      updatePaddlePositionByClientX(e.touches[0].clientX);
    }
  };

  const handleMouseMove = (e) => {
    if (e.buttons === 1) {
      updatePaddlePositionByClientX(e.clientX);
    }
  };

  const saveToGoogleSheet = async (finalFormattedTime) => {
    try {
      if (!GOOGLE_SHEET_URL) return;
      await fetch(GOOGLE_SHEET_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: playerName || "익명",
          finishtime: finalFormattedTime,
        }),
      });
      setTimeout(fetchTopRankings, 1200);
    } catch (e) {
      console.warn("구글 시트 저장 실패:", e);
    }
  };

  useEffect(() => {
    if (screen !== "playing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let currentLives = lives;
    let currentRedTarget = redTargetLeft;

    const gameLoop = () => {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const { paddle, ball, keys, bricks } = gameStateRef.current;

      if (!isPaused && !gameResult && countdown === null) {
        if (keys.left && paddle.x > 0) {
          paddle.x -= paddle.speed;
        }
        if (keys.right && paddle.x + paddle.width < CANVAS_WIDTH) {
          paddle.x += paddle.speed;
        }

        if (ball.inMotion) {
          ball.x += ball.dx;
          ball.y += ball.dy;

          if (ball.x - ball.radius <= 0) {
            ball.x = ball.radius;
            ball.dx = -ball.dx;
            playSoundEffect(320, "sine", 0.05);
          } else if (ball.x + ball.radius >= CANVAS_WIDTH) {
            ball.x = CANVAS_WIDTH - ball.radius;
            ball.dx = -ball.dx;
            playSoundEffect(320, "sine", 0.05);
          }

          if (ball.y - ball.radius <= 0) {
            ball.y = ball.radius;
            ball.dy = -ball.dy;
            playSoundEffect(320, "sine", 0.05);
          }

          if (
            ball.y + ball.radius >= paddle.y &&
            ball.y - ball.radius <= paddle.y + paddle.height &&
            ball.x >= paddle.x &&
            ball.x <= paddle.x + paddle.width
          ) {
            const hitOffset = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
            const maxAngle = (75 * Math.PI) / 180;
            const bounceAngle = hitOffset * maxAngle;

            ball.dx = ball.speed * Math.sin(bounceAngle);
            ball.dy = -ball.speed * Math.cos(bounceAngle);
            ball.y = paddle.y - ball.radius;
            playSoundEffect(480, "triangle", 0.08);
          }

          if (ball.y - ball.radius > CANVAS_HEIGHT) {
            currentLives -= 1;
            setLives(currentLives);
            playSoundEffect(160, "sawtooth", 0.2);

            if (currentLives <= 0) {
              stopTimer();
              ball.inMotion = false;
              setGameResult("fail");
              if (bgmRef.current) bgmRef.current.pause();
            } else {
              ball.x = paddle.x + paddle.width / 2;
              ball.y = paddle.y - 15;
              ball.inMotion = false;
              setTimeout(() => {
                launchBall();
              }, 800);
            }
          }

          bricks.forEach((b) => {
            if (b.status === 1) {
              if (
                ball.x + ball.radius > b.x &&
                ball.x - ball.radius < b.x + b.width &&
                ball.y + ball.radius > b.y &&
                ball.y - ball.radius < b.y + b.height
              ) {
                b.status = 0;
                ball.dy = -ball.dy;
                setScore((s) => s + 100);
                playSoundEffect(580, "square", 0.08);

                if (b.isTarget) {
                  currentRedTarget -= 1;
                  setRedTargetLeft(currentRedTarget);

                  triggerThumbsUpEffect();

                  if (currentRedTarget <= 0) {
                    stopTimer();
                    ball.inMotion = false;
                    setGameResult("success");
                    if (bgmRef.current) bgmRef.current.pause();

                    confetti({
                      particleCount: 120,
                      spread: 80,
                      origin: { y: 0.6 },
                    });
                    setTimeout(() => {
                      confetti({
                        particleCount: 80,
                        angle: 60,
                        spread: 55,
                        origin: { x: 0 },
                      });
                      confetti({
                        particleCount: 80,
                        angle: 120,
                        spread: 55,
                        origin: { x: 1 },
                      });
                    }, 300);

                    saveToGoogleSheet(formatTime(elapsedTime));
                  }
                }
              }
            }
          });
        }
      }

      bricks.forEach((b) => {
        if (b.status === 1) {
          const color = COLOR_PALETTE[b.colorKey];
          ctx.save();
          ctx.fillStyle = color.bg;
          ctx.strokeStyle = color.border;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(b.x, b.y, b.width, b.height, 5);
          ctx.fill();
          ctx.stroke();

          if (b.isTarget) {
            ctx.fillStyle = "#ef4444";
            ctx.font = "bold 10px Pretendard, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("★ INU", b.x + b.width / 2, b.y + b.height / 2);
          }
          ctx.restore();
        }
      });

      ctx.save();
      const pGrad = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.height);
      pGrad.addColorStop(0, "#2563eb");
      pGrad.addColorStop(1, "#1d4ed8");
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 8);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fillStyle = "#f59e0b";
      ctx.shadowColor = "rgba(245, 158, 11, 0.4)";
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.closePath();
      ctx.restore();

      animationFrameId.current = requestAnimationFrame(gameLoop);
    };

    animationFrameId.current = requestAnimationFrame(gameLoop);
    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [screen, isPaused, gameResult, countdown, elapsedTime]);

  const isThumbsUpActive = thumbsUpUntil > 0 && Date.now() < thumbsUpUntil;

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-3 bg-[#eaf2fd]">
      <audio ref={bgmRef} src="/Hyper_Speed_Run.mp3" loop preload="auto" />

      <div className="w-[430px] max-w-full bg-white rounded-[32px] shadow-[0_20px_50px_rgba(37,99,235,0.18)] border border-blue-100 overflow-hidden flex flex-col h-[740px] relative">
        <div className="bg-[#2a4ce8] text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#facc15] inline-block shadow-sm"></span>
            <span className="text-[15px] font-black tracking-tight flex items-center gap-1.5">
              <span>🔥</span> INU 횃불이 벽돌깨기
            </span>
          </div>
          <span className="text-[11px] font-bold bg-white/20 px-3 py-0.5 rounded-full text-white/95">
            인천대학교
          </span>
        </div>

        {screen === "intro" && (
          <div className="flex-1 p-5 flex flex-col items-center justify-between text-center overflow-hidden">
            <div className="flex flex-col items-center mt-1">
              <h1 className="text-[24px] font-black text-[#1e3a8a] tracking-tight mb-1">
                INU 횃불이 벽돌깨기
              </h1>
              <p className="text-[11px] text-slate-500 font-medium">
                인천대 공식 마스코트 횃불이와 함께하는 아케이드 게임
              </p>
            </div>

            <div className="my-2 flex flex-col items-center">
              <div className="relative p-2.5 bg-[#e2ecf9] rounded-[24px]">
                <div className="w-40 h-40 bg-white rounded-[18px] shadow-sm flex items-center justify-center p-2 overflow-hidden border border-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/Mascot.jpg"
                    alt="인천대학교 공식 마스코트 횃불이"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="absolute -bottom-2 right-3 bg-[#facc15] text-slate-900 text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-md flex items-center gap-1 border border-yellow-300">
                  <span>⚡</span> 횃불이
                </div>
              </div>
            </div>

            <div className="w-full text-left mb-1.5">
              <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 mb-1">
                <User className="w-3.5 h-3.5 text-[#2563eb]" />
                플레이어 이름
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="이름을 입력하세요"
                  className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl text-slate-800 text-[13px] font-bold focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent transition shadow-sm"
                  onKeyDown={(e) => e.key === "Enter" && handleStartGame()}
                />
                {playerName && (
                  <button
                    onClick={() => setPlayerName("")}
                    className="absolute right-3 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={handleStartGame}
              className="w-full py-2.5 bg-[#2a4ce8] hover:bg-[#203cc5] text-white font-black text-sm rounded-xl shadow-[0_8px_20px_-4px_rgba(42,76,232,0.5)] transition active:scale-[0.98] flex items-center justify-center gap-1.5 mb-2"
            >
              <span>게임 시작하기</span>
              <span>▶</span>
            </button>

            <div className="w-full bg-[#f8fafc] border border-slate-200/80 rounded-xl p-2 px-3 mb-1.5">
              <div className="text-[10px] font-bold text-[#2563eb] mb-1 flex items-center justify-center gap-1">
                <span>🪪</span> 제작자 정보
              </div>
              <div className="grid grid-cols-3 text-center divide-x divide-slate-200 text-[10px]">
                <div className="px-1">
                  <span className="block text-slate-400 text-[9px]">학과</span>
                  <span className="font-bold text-slate-700">해양학과</span>
                </div>
                <div className="px-1">
                  <span className="block text-slate-400 text-[9px]">학번</span>
                  <span className="font-bold text-slate-700">202200453</span>
                </div>
                <div className="px-1">
                  <span className="block text-slate-400 text-[9px]">이름</span>
                  <span className="font-bold text-[#2563eb]">임채원</span>
                </div>
              </div>
            </div>

            <div className="w-full bg-blue-50/70 border border-blue-100 rounded-xl p-2 px-3 mb-1">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#1e3a8a] mb-1">
                <span className="flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-[#facc15]" />
                  <span>실시간 Top 3 랭킹</span>
                </span>
                <span className="text-[9px] text-blue-600 font-semibold">구글 시트 연동</span>
              </div>
              <div className="space-y-1">
                {topRankings.map((rank, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center bg-white/90 px-2.5 py-1 rounded-lg border border-blue-50 text-[11px]"
                  >
                    <span className="text-slate-700 font-semibold flex items-center gap-1">
                      <span>{idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}</span>
                      <span>{rank.name}</span>
                    </span>
                    <span className="font-mono font-bold text-[#2563eb]">{rank.finishtime}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-[9px] text-slate-400">
              © 2025 Incheon National University Arcade. All Rights Reserved.
            </div>
          </div>
        )}

        {screen === "playing" && (
          <div className="flex-1 flex flex-col justify-between p-3.5 bg-slate-50 overflow-hidden">
            <div className="bg-white rounded-2xl p-2.5 px-3.5 shadow-sm border border-slate-200 flex items-center justify-between shrink-0 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-[#1e3a8a]">{playerName}</span>
                <span className="bg-red-50 text-red-600 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  타깃: {redTargetLeft}/3
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                  ⏱ {formatTime(elapsedTime)}
                </span>
                <div className="flex items-center">
                  {[...Array(3)].map((_, i) => (
                    <span key={i} className={`text-xs ${i < lives ? "opacity-100" : "opacity-25 grayscale"}`}>
                      ❤️
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => {
                    const muted = !isMuted;
                    setIsMuted(muted);
                    if (bgmRef.current) bgmRef.current.muted = muted;
                  }}
                  className="p-1 text-slate-500 hover:text-slate-800"
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-red-500" /> : <Volume2 className="w-4 h-4 text-blue-600" />}
                </button>
              </div>
            </div>

            <div
              className="relative flex-1 w-full rounded-2xl overflow-hidden shadow-sm border border-slate-200 bg-[#edf4fe] touch-none select-none cursor-ew-resize"
              onTouchStart={(e) => handleTouchMove(e)}
              onTouchMove={(e) => handleTouchMove(e)}
              onMouseMove={(e) => handleMouseMove(e)}
            >
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/dancing_mascot.gif"
                  alt="배경 횃불이 애니메이션"
                  className="w-56 h-56 object-contain opacity-25 select-none"
                />
              </div>

              {isThumbsUpActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-25 transition-opacity duration-300">
                  <div className="relative flex flex-col items-center animate-bounce">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/따봉횟불.png"
                      alt="따봉 횃불이"
                      className="w-32 h-32 object-contain drop-shadow-[0_8px_16px_rgba(250,204,21,0.5)]"
                      onError={(e) => {
                        e.target.src = "/thumbs_up.png";
                      }}
                    />
                    <span className="bg-[#2a4ce8] text-white text-[12px] font-black px-3 py-0.5 rounded-full shadow-md border border-white mt-[-8px]">
                      👍 나이스 샷!
                    </span>
                  </div>
                </div>
              )}

              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                className="w-full h-full block relative z-10"
              />

              {countdown !== null && (
                <div className="absolute inset-0 bg-blue-900/50 backdrop-blur-sm flex items-center justify-center z-20">
                  <div className="text-6xl font-black text-[#facc15] animate-bounce">
                    {countdown}
                  </div>
                </div>
              )}

              {isPaused && (
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center z-20 gap-2 text-white">
                  <div className="text-xl font-bold">일시정지 (PAUSED)</div>
                  <button
                    onClick={togglePause}
                    className="mt-2 px-5 py-2 bg-[#2a4ce8] text-white text-xs font-bold rounded-xl shadow-md"
                  >
                    계속하기
                  </button>
                </div>
              )}

              {gameResult === "success" && (
                <div className="absolute inset-0 bg-white/95 backdrop-blur-md flex flex-col items-center justify-center z-30 p-5 text-center animate-fade-in">
                  
                  {/* 상단 횃불이 마스코트 아이콘 */}
                  <div className="w-14 h-14 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center p-2 mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/dancing_mascot.gif"
                      alt="마스코트"
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        e.target.src = "/Mascot.jpg";
                      }}
                    />
                  </div>

                  {/* PERFECT CLEAR! 타이틀 */}
                  <h2 className="text-[24px] font-black text-slate-900 tracking-tight mb-2.5">
                    PERFECT CLEAR!
                  </h2>

                  {/* YOUR PERFORMANCE 박스 */}
                  <div className="bg-[#eef5ff] border border-blue-100 rounded-2xl p-2.5 px-6 w-full max-w-[280px] mb-3 text-center">
                    <span className="text-[10px] font-black text-[#3b82f6] tracking-wider block mb-0.5">
                      YOUR PERFORMANCE
                    </span>
                    <div className="flex items-center justify-center gap-1.5 text-[24px] font-black text-slate-900 font-mono">
                      <Clock className="w-5 h-5 text-[#2563eb]" />
                      <span>{formatTime(elapsedTime)}</span>
                    </div>
                  </div>

                  {/* HALL OF FAME (명예의 전당 Top 3) */}
                  <div className="w-full max-w-[280px] mb-4 text-left">
                    <div className="flex items-center gap-1 text-[11px] font-black text-amber-500 uppercase tracking-wider mb-1.5">
                      <Trophy className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      <span>HALL OF FAME</span>
                    </div>

                    <div className="space-y-1.5">
                      {topRankings.map((rank, idx) => {
                        const isFirst = idx === 0;
                        return (
                          <div
                            key={idx}
                            className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold border transition ${
                              isFirst
                                ? "bg-[#fffbeb] border-amber-200 text-slate-800"
                                : "bg-[#f8fafc] border-slate-200 text-slate-700"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black text-white ${
                                  idx === 0
                                    ? "bg-amber-500"
                                    : idx === 1
                                    ? "bg-slate-400"
                                    : "bg-orange-500"
                                }`}
                              >
                                {idx + 1}
                              </span>
                              <span className="font-bold">{rank.name}</span>
                            </div>
                            <span className="font-mono font-black text-[#2563eb]">
                              {rank.finishtime}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 메인으로 돌아가기 버튼 */}
                  <button
                    onClick={handleResetToNameScreen}
                    className="w-full max-w-[280px] py-3 bg-[#1d4ed8] hover:bg-[#1e40af] text-white font-black text-sm rounded-xl shadow-[0_8px_20px_-4px_rgba(29,78,216,0.5)] transition active:scale-[0.98]"
                  >
                    메인으로 돌아가기
                  </button>
                </div>
              )}

              {gameResult === "fail" && (
                <div className="absolute inset-0 bg-white/95 backdrop-blur-md flex flex-col items-center justify-center z-30 p-5 text-center">
                  <div className="text-4xl mb-1">😢</div>
                  <h2 className="text-xl font-black text-red-600 mb-1">게임 미션 실패</h2>
                  <p className="text-xs text-slate-500 mb-3">생명을 모두 소진했습니다.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleStartGame}
                      className="px-4 py-2 bg-red-600 text-white font-bold rounded-xl text-xs"
                    >
                      재도전하기
                    </button>
                    <button
                      onClick={handleResetToNameScreen}
                      className="px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                    >
                      처음 화면으로
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-2.5 bg-white border border-slate-200 rounded-2xl p-2 px-3 flex items-center justify-between text-xs shadow-sm shrink-0">
              <span className="text-[11px] text-slate-500 font-medium">
                조작: [←] [→] / 스와이프
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={togglePause}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg flex items-center gap-1 text-[11px]"
                >
                  {isPaused ? <Play className="w-3 h-3 text-blue-600" /> : <Pause className="w-3 h-3 text-amber-600" />}
                  {isPaused ? "재개" : "일시정지"}
                </button>
                <button
                  onClick={handleResetToNameScreen}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg flex items-center gap-1 text-[11px]"
                >
                  <RotateCcw className="w-3 h-3 text-blue-600" />
                  다시 시작
                </button>
                <button
                  onClick={handleExitGame}
                  className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg flex items-center gap-1 text-[11px]"
                >
                  <LogOut className="w-3 h-3" />
                  종료
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
