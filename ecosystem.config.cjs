// PM2 설정 (개발 서버를 데몬으로 실행)
// pm2 start ecosystem.config.cjs 로 시작
module.exports = {
  apps: [
    {
      name: 'webapp',
      script: 'npx',
      // wrangler.jsonc 의 d1_databases 바인딩을 그대로 사용 (--d1 플래그 생략).
      // 이렇게 하면 'wrangler d1 execute' 와 동일한 로컬 SQLite 파일을 공유함.
      args: 'wrangler pages dev dist --local --ip 0.0.0.0 --port 3000',
      cwd: '/home/user/webapp',
      env: { NODE_ENV: 'development' },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
  ],
}
