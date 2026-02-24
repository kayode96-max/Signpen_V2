"use client";

import React, { useEffect, useRef } from "react";

const Confetti: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const pieces: Piece[] = [];
    const numberOfPieces = 200;
    const colors = ["#E6E6FA", "#D8BFD8", "#FFD700", "#C0C0C0"];

    class Piece {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      color: string;
      rotation: number;
      rotationSpeed: number;

      constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 8 + 4;
        this.speedX = Math.random() * 5 - 2.5;
        this.speedY = Math.random() * -15 - 5;
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.rotation = Math.random() * 360;
        this.rotationSpeed = Math.random() * 10 - 5;
      }

      update() {
        this.speedY += 0.5;
        this.x += this.speedX;
        this.y += this.speedY;
        this.rotation += this.rotationSpeed;
      }

      draw() {
        if (!context) return;
        context.save();
        context.translate(this.x, this.y);
        context.rotate(this.rotation * Math.PI / 180);
        context.fillStyle = this.color;
        context.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        context.restore();
      }
    }

    const createPieces = () => {
      const x = width / 2;
      const y = height / 2;
      for (let i = 0; i < numberOfPieces; i++) {
        pieces.push(new Piece(x, y));
      }
    };

    let animationFrameId: number;

    const animate = () => {
      context.clearRect(0, 0, width, height);
      pieces.forEach((p, index) => {
        p.update();
        p.draw();
        if (p.y > height) {
          pieces.splice(index, 1);
        }
      });

      if (pieces.length > 0) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    createPieces();
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 100,
      }}
    />
  );
};

export default Confetti;
