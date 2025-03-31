from flask import Flask, jsonify
import pickle

app = Flask(__name__)

# Load the trained ARIMA model with attached RMSE percentage
with open('arima_model.pkl', 'rb') as f:
    model_fit = pickle.load(f)

@app.route('/predict', methods=['GET'])
def predict():
    try:
        # Forecast one day ahead
        forecast = model_fit.forecast(steps=1)
        # Use .iloc[0] to extract the first forecast value
        predicted_rate = forecast.iloc[0]
        # Calculate confidence: higher confidence if RMSE percent is low
        confidence = 100 - model_fit.rmse_percent  # For example, if RMSE is 10%, confidence is 90%
        response = {
            "tomorrowsPrediction": f"{predicted_rate:.2f} IRR",
            "confidence": f"{confidence:.2f}%"
        }
        return jsonify(response)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002)




