import { spawn } from 'node:child_process';

console.log('Starting the application...');

const app = spawn('node', ['build/start-server.js'], { stdio: ['pipe', 'pipe', process.stderr] });

// Listen for errors when spawning the process
app.on('error', (err) => {
  console.error('Failed to start the app:', err);
  process.exit(1); // Exit with a failure code if there is an error
});


// Listen for when the process starts
app.on('message', () => {
  setTimeout(() => {
    console.log('App started successfully');
    app.kill(); 
    process.exit(0); 
  }, 3000); 
});

// Clean up and ensure the process is killed if interrupted
process.on('disconnect', () => {
  console.log('END')
  app.kill();
});

// Ensure the process is killed if the script is interrupted
process.on('SIGINT', () => {
  app.kill();
  process.exit(1);
});
