import pika
import json
import time
import requests
from io import BytesIO
from PIL import Image, ImageFilter

RABBITMQ_HOST = 'localhost'

def process_image(ch, method, properties, body):
    try:
        task = json.loads(body)
        jobId = task.get('jobId')
        sourceUrl = task.get('sourceUrl')
        
        if not jobId or not sourceUrl:
            print("[!] Invalid task format. Missing jobId or sourceUrl.")
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return

        print(f"[*] Processing job {jobId} from {sourceUrl}")

        # Send PROCESSING status
        update_status(ch, jobId, "PROCESSING")

        # Download image
        response = requests.get(sourceUrl)
        response.raise_for_status()

        # Process image using Pillow
        img = Image.open(BytesIO(response.content))
        img = img.convert('L') # Grayscale
        img = img.filter(ImageFilter.GaussianBlur(radius=5)) # Apply Gaussian Blur

        output_filename = f"output_{jobId}.jpg"
        img.save(output_filename)

        print(f"[*] Job {jobId} finished successfully. Saved to {output_filename}")

        # Send DONE status
        update_status(ch, jobId, "DONE", output_filename)

        # Acknowledge task completion
        ch.basic_ack(delivery_tag=method.delivery_tag)

    except Exception as e:
        print(f"[!] Error processing job {jobId}: {e}")
        try:
            update_status(ch, jobId, "ERROR")
        except:
            pass
        # Acknowledge to remove the failed task from queue so it doesn't block others forever
        ch.basic_ack(delivery_tag=method.delivery_tag)

def update_status(ch, jobId, status, resultUrl=None):
    update = {"jobId": jobId, "status": status}
    if resultUrl:
        update["resultUrl"] = resultUrl
        
    ch.basic_publish(
        exchange='',
        routing_key='job_updates',
        body=json.dumps(update),
        properties=pika.BasicProperties(
            delivery_mode=2,  # make message persistent
        )
    )
    print(f"    -> Sent update for {jobId}: {status}")

def main():
    try:
        print(f"[*] Connecting to RabbitMQ at {RABBITMQ_HOST}...")
        connection = pika.BlockingConnection(pika.ConnectionParameters(host=RABBITMQ_HOST))
        channel = connection.channel()

        # Ensure queues exist
        channel.queue_declare(queue='image_tasks', durable=True)
        channel.queue_declare(queue='job_updates', durable=True)

        print(' [*] Waiting for tasks in image_tasks queue. To exit press CTRL+C')
        channel.basic_qos(prefetch_count=1)
        channel.basic_consume(queue='image_tasks', on_message_callback=process_image)

        channel.start_consuming()
    except KeyboardInterrupt:
        print('\n[*] Interrupted by user.')
        connection.close()
    except pika.exceptions.AMQPConnectionError:
        print(f"\n[!] Failed to connect to RabbitMQ. Is it running at {RABBITMQ_HOST}:5672?")

if __name__ == '__main__':
    main()
