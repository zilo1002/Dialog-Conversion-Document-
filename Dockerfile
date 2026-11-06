# 国内可直连的自有 VPS / Zeabur 一键运行用
FROM node:22-alpine

WORKDIR /app

# 先装依赖，这一层有 package-lock.json 锁定版本，构建可复现
COPY package.json package-lock.json ./
RUN npm install --omit=dev

# 再放代码，改代码时不会重新装依赖
COPY . .

# 端口读环境变量 PORT，本地/容器外没设时默认 5178
ENV NODE_ENV=production
EXPOSE 5178

CMD ["npm", "start"]
